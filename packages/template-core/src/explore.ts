import { compactScript, emptyInput, Rng, type InputFrame, type InputSegment, type InputState, type Sim, type SimSave } from '@gg/sdk';

export interface ExploreOptions {
  /** Simulated ticks to spend before giving up (default 150 000, about 40 minutes of play). */
  budget?: number;
  /** Seed for the explorer's own choices (never the game's rng, so the game plays as it always does). */
  seed?: number;
  /** Size of a position cell in px (default two tiles). */
  cellPx?: number;
  /** Longest exploration burst from a chosen cell, in ticks (default 90). */
  burst?: number;
  /** Keys the explorer may press (default every key but pause). */
  keys?: ReadonlyArray<keyof InputState>;
  /** Live cells kept at most (default 2500): past it the least promising tenth is dropped, which bounds memory. */
  maxCells?: number;
  /** Share of bursts that start from the frontier, the most progressed cells (default 0.4); the rest roam the archive. */
  frontier?: number;
  /** Grid games (a system's directions are 'step'): tap one direction, release, tap again, instead of holding keys. */
  taps?: boolean;
}

export interface ExploreResult {
  completed: boolean;
  /** The winning input timeline from tick 0: sim.run in Node, runScript in the browser. Verified by a fresh replay. */
  script: InputSegment[] | null;
  /** Length of the winning run in ticks (-1 when not completed). */
  ticks: number;
  /** Ticks simulated in all. */
  explored: number;
  /** Distinct cells reached. */
  cells: number;
  /** The most progressed moment: the sim's progress (0 to 1), score, HUD and distance from the goal tile (in tiles). */
  best: { progress: number; score: number; hud: Record<string, number | string>; goalDistance: number };
}

interface Cell {
  id: number;
  key: string;
  /** False once a better moment took this cell's place in the archive. */
  live: boolean;
  parent: number;
  /** The inputs from the parent cell's tick to this cell's tick (change points, absolute ticks). */
  frames: InputFrame[];
  tick: number;
  /** Null once the cell was dropped from the archive (its frames stay, for the scripts of its descendants). */
  save: SimSave | null;
  score: number;
  /** What the game's own systems say about how close the level is to won (Sim.progress). */
  progress: number;
  chosen: number;
  seen: number;
}

const DEFAULT_KEYS: ReadonlyArray<keyof InputState> = ['left', 'right', 'up', 'down', 'jump', 'dash', 'action'];

type Controls = ReadonlyArray<{ controls?: Partial<Record<string, string>> }>;

/** Keys an explorer may press for a set of systems: every key but those a system uses to undo or restart. */
export function explorerKeys(systems: Controls): Array<keyof InputState> {
  const skip = new Set<string>();
  for (const s of systems) for (const [k, v] of Object.entries(s.controls ?? {})) if (v === 'undo' || v === 'restart') skip.add(k);
  return DEFAULT_KEYS.filter((k) => !skip.has(k));
}

/** Explorer options a game's systems imply from their controls: the keys, and taps for grid steppers. */
export function explorerOptionsFor(systems: Controls): Pick<ExploreOptions, 'keys' | 'taps'> {
  return { keys: explorerKeys(systems), taps: systems.some((s) => s.controls?.['left'] === 'step' || s.controls?.['up'] === 'step') };
}

/** Exact while small, then coarser: a counter that ticks up opens a new cell; a big score does not open thousands. */
function bucket(v: number): number {
  const a = Math.abs(v);
  return a <= 20 ? Math.round(v) : Math.sign(v) * (20 + Math.round(Math.log2(a / 20) * 3));
}

/**
 * The cell a moment belongs to, from what any game built on the SDK has: where the player is (coarsely), whether they
 * are alive, the numbers the HUD shows and the score, how many enemies and pickups are left, where props that only move
 * when pushed stand (crates), and which menu is open. No genre knowledge: progress is whatever the game itself counts.
 */
export function cellKey(sim: Sim, cellPx: number): string {
  const w = sim.world;
  const p = w.player;
  const ts = sim.map.tileSize;
  const parts: Array<string | number> = [Math.floor((p.x + p.w / 2) / cellPx), Math.floor((p.y + p.h / 2) / cellPx), p.alive ? 1 : 0];
  for (const k of Object.keys(w.hud).sort()) {
    const v = w.hud[k];
    parts.push(typeof v === 'number' ? bucket(v) : String(v));
  }
  parts.push(bucket(w.score));
  let hostiles = 0;
  let pickups = 0;
  const props: string[] = [];
  for (const e of w.entities) {
    if (e.isPlayer || !e.alive || e.isProjectile) continue;
    if (e.pickup) pickups++;
    else if (e.fsm) hostiles++;
    else props.push(`${e.type}@${Math.floor(e.x / ts)},${Math.floor(e.y / ts)}`);
  }
  parts.push(hostiles, pickups, ...props.sort());
  if (w.menu) parts.push(`menu:${w.menu.id}:${w.menu.selected}`);
  return parts.join('|');
}

function goalDistance(sim: Sim): number {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const g = sim.map.level.goal;
  return Math.hypot((p.x + p.w / 2) / ts - (g.x + 0.5), (p.y + p.h / 2) / ts - (g.y + 0.5));
}

/**
 * The universal explorer: proves a level can be finished without knowing anything about its genre. Go-Explore over the
 * deterministic sim: it keeps an archive of distinct moments (cells), picks one (favouring the rarely chosen, the
 * rarely seen, and above all those its systems say are closer to winning: Sim.progress), restores the sim there exactly
 * from a save point, plays a burst of random held inputs from it, and keeps every new or better moment it reaches. It
 * stops when the level is won, and replays the winning inputs on a fresh sim to prove them. Curated genres keep their
 * own solver bots; this is what checks a game nobody wrote a bot for.
 */
export function explore(make: () => Sim, opts: ExploreOptions = {}): ExploreResult {
  const budget = opts.budget ?? 150_000;
  const cellPx = opts.cellPx ?? 16;
  const burstMax = opts.burst ?? 90;
  const maxCells = opts.maxCells ?? 2500;
  const frontierShare = opts.frontier ?? 0.4;
  let liveCount = 0;
  const keys = new Set(opts.keys ?? DEFAULT_KEYS);
  const rng = new Rng(opts.seed ?? 7);
  const sim = make();
  const platformer = (sim.options.movementMode ?? 'platformer') === 'platformer';
  const cells: Cell[] = [];
  const archive = new Map<string, Cell>();
  // Rarely chosen, rarely seen, and above all closer to winning by the game's own account.
  const weight = (c: Cell): number => (1 / Math.sqrt(1 + c.chosen) + 0.5 / Math.sqrt(1 + c.seen)) * (1 + 8 * c.progress * c.progress);
  const add = (key: string, parent: number, frames: InputFrame[]): Cell => {
    const cell: Cell = { id: cells.length, key, live: true, parent, frames, tick: sim.tick, save: sim.save(), score: sim.world.score, progress: sim.progress(), chosen: 0, seen: 0 };
    const old = archive.get(key);
    if (old) drop(old);
    archive.set(key, cell);
    cells.push(cell);
    liveCount++;
    if (liveCount > maxCells) {
      // Drop the least promising tenth (never the start, which every script begins from).
      const live = cells.filter((c) => c.live && c.parent >= 0).sort((a, b) => weight(a) - weight(b));
      for (const c of live.slice(0, Math.ceil(maxCells / 10))) {
        archive.delete(c.key);
        drop(c);
      }
    }
    return cell;
  };
  function drop(c: Cell): void {
    if (!c.live) return;
    c.live = false;
    c.save = null;
    liveCount--;
  }
  add(cellKey(sim, cellPx), -1, []);

  const randomInput = (): InputState => {
    const input = emptyInput();
    if (sim.world.menu) {
      // Menus: move the highlight now and then, and pick.
      const r = rng.int(4);
      if (r === 0 && keys.has('right')) input.right = true;
      else if (r === 1 && keys.has('left')) input.left = true;
      else if (keys.has('action')) input.action = true;
      return input;
    }
    const dir = rng.int(platformer ? 6 : 9);
    if (platformer) {
      // Mostly running, sometimes standing, now and then looking up or down.
      if (dir <= 1) input.right = true;
      else if (dir === 2) input.left = true;
      else if (dir === 3) input.right = input.down = true;
      else if (dir === 4) input.up = true;
      if (rng.chance(0.4)) input.jump = true;
    } else {
      const dx = [0, 1, 1, 0, -1, -1, -1, 0, 1][dir]!;
      const dy = [0, 0, 1, 1, 1, 0, -1, -1, -1][dir]!;
      input.right = dx > 0;
      input.left = dx < 0;
      input.down = dy > 0;
      input.up = dy < 0;
      if (rng.chance(0.06)) input.jump = true;
    }
    if (rng.chance(0.1)) input.dash = true;
    if (rng.chance(0.45)) input.action = true;
    for (const k of Object.keys(input) as Array<keyof InputState>) if (!keys.has(k)) input[k] = false;
    return input;
  };


  const scriptTo = (cell: Cell, tail: InputFrame[], endTick: number): InputSegment[] => {
    const chain: InputFrame[][] = [tail];
    for (let c: Cell | undefined = cell; c && c.parent >= 0; c = cells[c.parent]) chain.push(c.frames);
    const frames = chain.reverse().flat();
    // A cell's last frame and its child's first can share a tick (the child's input is the one in force).
    return compactScript(frames.map((f, i) => ({ from: f.tick, to: frames[i + 1]?.tick ?? endTick, input: { ...f.input } })));
  };

  let explored = 0;
  let best = cells[0]!;
  while (explored < budget) {
    // Choose a cell: often one of the most progressed (push the frontier), otherwise a roulette over the weights.
    let from = cells[0]!;
    if (rng.float() < frontierShare) {
      let top = 0;
      for (const c of cells) if (c.live && c.progress > top) top = c.progress;
      const front = cells.filter((c) => c.live && c.progress >= top - 0.02);
      from = front[rng.int(front.length)] ?? from;
    } else {
      let total = 0;
      for (const c of cells) if (c.live) total += weight(c);
      let r = rng.float() * total;
      for (const c of cells) {
        if (!c.live) continue;
        r -= weight(c);
        if (r <= 0) {
          from = c;
          break;
        }
      }
    }
    from.chosen++;
    sim.load(from.save!);
    const frames: InputFrame[] = [];
    const length = 15 + rng.int(burstMax);
    let input = emptyInput();
    let hold = 0;
    let tapped = false;
    for (let t = 0; t < length && explored < budget; t++) {
      if (hold <= 0) {
        // Taps alternate a short press with a release long enough for one grid step to finish.
        tapped = opts.taps === true && !tapped;
        input = opts.taps && !tapped ? emptyInput() : randomInput();
        hold = opts.taps ? (tapped ? 2 : 6 + rng.int(4)) : 2 + rng.int(sim.world.menu ? 3 : 18);
        frames.push({ tick: sim.tick, input: { ...input } });
      }
      hold--;
      sim.step(input);
      explored++;
      if (sim.world.flags.won && !sim.world.menu) {
        const script = scriptTo(from, frames, sim.tick);
        // Proof: a fresh sim under the found inputs wins too.
        const check = make();
        check.run(script, sim.tick);
        const proved = check.world.flags.won;
        return { completed: proved, script: proved ? script : null, ticks: proved ? sim.tick : -1, explored, cells: archive.size, best: report(sim) };
      }
      if (sim.world.flags.gameOver) break;
      const key = cellKey(sim, cellPx);
      const known = archive.get(key);
      const progress = sim.progress();
      if (!known || progress > known.progress || (progress === known.progress && (sim.world.score > known.score || (sim.world.score === known.score && sim.tick < known.tick)))) {
        // A burst that goes on from a new cell continues as that cell's child.
        const cell = add(key, from.id, frames.slice());
        if (cell.progress > best.progress || (cell.progress === best.progress && cell.score > best.score)) best = cell;
        frames.length = 0;
        frames.push({ tick: sim.tick, input: { ...input } });
        from = cell;
      } else known.seen++;
    }
  }
  if (best.save) sim.load(best.save);
  return { completed: false, script: null, ticks: -1, explored, cells: archive.size, best: report(sim) };

  function report(s: Sim): ExploreResult['best'] {
    return { progress: Math.round(s.progress() * 100) / 100, score: s.world.score, hud: { ...s.world.hud }, goalDistance: Math.round(goalDistance(s) * 10) / 10 };
  }
}
