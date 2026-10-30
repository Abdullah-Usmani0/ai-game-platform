import type { HintStep } from '@gg/schemas';
import { centerX, centerY, compactScript, emptyInput, Rng, type InputFrame, type InputSegment, type InputState, type Sim, type SimSave } from '@gg/sdk';

/** A step toward the win for the explorer to climb, in order (made from a level's hints by subgoalsFrom). */
export interface Subgoal {
  /** Whether the step is done at this moment. */
  done: (sim: Sim) => boolean;
  /** How close the moment is to it, from 0 to 1 (1 when done). */
  closeness: (sim: Sim) => number;
  /** The way toward it from here, a step on each axis (-1, 0 or 1), when it is a place to go. */
  toward?: (sim: Sim) => { dx: number; dy: number };
}

/**
 * A level's hints as the explorer climbs them. A place is done once the player is within r tiles of it by a walk over
 * open tiles (never through a wall: a way that doubles back would otherwise lure the explorer to the wrong side), and
 * nearer as that walk shortens, evenly over the leg from the place before it (the spawn, for the first): a tile nearer
 * counts as much at the leg's start as at its end. A HUD number, or the score, is done at its value and nearer as it
 * grows.
 */
export function subgoalsFrom(steps: readonly HintStep[]): Subgoal[] {
  return steps.map((step, index): Subgoal => {
    if (step.kind === 'reach') {
      // Where the leg to this place starts: the place before it, else the spawn.
      const before = steps.slice(0, index).reverse().find((s) => s.kind === 'reach');
      const r = step.r ?? 1;
      // Tiles of walk from every open tile to the place, kept per map until its tiles change (a door opens).
      const fields = new WeakMap<object, { version: number; dist: Int32Array }>();
      const fieldOf = (sim: Sim): Int32Array => {
        const map = sim.map;
        const known = fields.get(map);
        if (known && known.version === map.version) return known.dist;
        const { width: w, height: h } = map;
        const dist = new Int32Array(w * h).fill(-1);
        const open = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && map.kindAt(x, y) !== 'solid';
        if (open(step.x, step.y)) {
          dist[step.y * w + step.x] = 0;
          const queue = [step.y * w + step.x];
          for (let q = 0; q < queue.length; q++) {
            const i = queue[q]!;
            const x = i % w;
            const y = (i - x) / w;
            for (const [nx, ny] of [
              [x + 1, y],
              [x - 1, y],
              [x, y + 1],
              [x, y - 1],
            ] as const) {
              if (!open(nx, ny) || dist[ny * w + nx]! >= 0) continue;
              dist[ny * w + nx] = dist[i]! + 1;
              queue.push(ny * w + nx);
            }
          }
        }
        fields.set(map, { version: map.version, dist });
        return dist;
      };
      // The walk from a tile, or the straight line when no walk joins them (a place in a wall, a sealed room).
      const walkFrom = (sim: Sim, tx: number, ty: number): number => {
        const d = tx >= 0 && ty >= 0 && tx < sim.map.width && ty < sim.map.height ? fieldOf(sim)[ty * sim.map.width + tx]! : -1;
        return d >= 0 ? d : Math.hypot(tx - step.x, ty - step.y);
      };
      const away = (sim: Sim): number => {
        const ts = sim.map.tileSize;
        const p = sim.world.player;
        return walkFrom(sim, Math.floor(centerX(p) / ts), Math.floor(centerY(p) / ts));
      };
      const leg = (sim: Sim): number => {
        const from = before && before.kind === 'reach' ? before : sim.map.level.spawn;
        return Math.max(1, walkFrom(sim, from.x, from.y) - r);
      };
      // Downhill on the walk: the open neighbour nearest the place, else straight at it.
      const toward = (sim: Sim): { dx: number; dy: number } => {
        const ts = sim.map.tileSize;
        const p = sim.world.player;
        const tx = Math.floor(centerX(p) / ts);
        const ty = Math.floor(centerY(p) / ts);
        let best = { dx: Math.sign(step.x - tx), dy: Math.sign(step.y - ty) };
        let bestD = walkFrom(sim, tx, ty);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= sim.map.width || ny >= sim.map.height) continue;
          const d = fieldOf(sim)[ny * sim.map.width + nx]!;
          if (d >= 0 && d < bestD) {
            bestD = d;
            best = { dx, dy };
          }
        }
        return best;
      };
      return { done: (sim) => sim.world.player.alive && away(sim) <= r, closeness: (sim) => Math.max(0, 1 - Math.max(0, away(sim) - r) / leg(sim)), toward };
    }
    const value = (sim: Sim) => (step.key === 'score' ? sim.world.score : Number(sim.world.hud[step.key] ?? 0));
    return { done: (sim) => value(sim) >= step.value, closeness: (sim) => Math.max(0, Math.min(1, value(sim) / Math.max(1e-9, step.value))) };
  });
}

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
  /**
   * Steps toward the win to climb in order (a level's hints). A moment's stage is how many it has done along its way;
   * the stage is part of where it is, and progress goes stage first. None: the game's own progress alone.
   */
  subgoals?: readonly Subgoal[];
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
  /**
   * The most progressed moment: the sim's progress (0 to 1), score, HUD, distance from the goal tile (in tiles), where
   * the player stood (in tiles) and, with subgoals, how many it had done.
   */
  best: { progress: number; score: number; hud: Record<string, number | string>; goalDistance: number; at: { x: number; y: number }; stage?: number };
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
  /** What the game's own systems say about how close the level is to won (Sim.progress), stage first with subgoals. */
  progress: number;
  /** Subgoals done in order on the way here. */
  stage: number;
  chosen: number;
  seen: number;
}

const DEFAULT_KEYS: ReadonlyArray<keyof InputState> = ['left', 'right', 'up', 'down', 'jump', 'dash', 'action'];

type Controls = ReadonlyArray<{ controls?: Partial<Record<string, string>>; takesOver?: readonly string[] }>;

/**
 * Keys an explorer may press for a set of systems: every key but those a system uses to undo or restart, and those a
 * system takes over (a runner's left and right do nothing).
 */
export function explorerKeys(systems: Controls): Array<keyof InputState> {
  const skip = new Set<string>();
  for (const s of systems) {
    for (const [k, v] of Object.entries(s.controls ?? {})) if (v === 'undo' || v === 'restart') skip.add(k);
    for (const k of s.takesOver ?? []) skip.add(k);
  }
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
  const subgoals = opts.subgoals ?? [];
  const n = subgoals.length;
  // Steps done in order from a stage, at this moment (several can fall at once).
  const climb = (stage: number): number => {
    let s = stage;
    while (s < n && subgoals[s]!.done(sim)) s++;
    return s;
  };
  // Stage first, then how near the next step is (with the game's own word on it), then the game's own progress.
  const progressAt = (stage: number): number => {
    const game = sim.progress();
    if (n === 0) return game;
    return (stage + (stage < n ? 0.7 * subgoals[stage]!.closeness(sim) + 0.3 * game : game)) / (n + 1);
  };
  const keyAt = (stage: number): string => (n === 0 ? cellKey(sim, cellPx) : `${cellKey(sim, cellPx)}|s${stage}`);
  // Rarely chosen, rarely seen, and above all closer to winning by the game's own account.
  const weight = (c: Cell): number => (1 / Math.sqrt(1 + c.chosen) + 0.5 / Math.sqrt(1 + c.seen)) * (1 + 8 * c.progress * c.progress);
  const add = (key: string, parent: number, frames: InputFrame[], stage: number): Cell => {
    const cell: Cell = { id: cells.length, key, live: true, parent, frames, tick: sim.tick, save: sim.save(), score: sim.world.score, progress: progressAt(stage), stage, chosen: 0, seen: 0 };
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
  const start = climb(0);
  add(keyAt(start), -1, [], start);

  const randomInput = (stage: number): InputState => {
    const input = emptyInput();
    const way = stage < n && !sim.world.menu ? subgoals[stage]!.toward?.(sim) : undefined;
    // Half the time, toward the next step of the hints (a jump now and then in a side view); the rest, at random.
    if (way && rng.chance(0.5)) {
      input.right = way.dx > 0;
      input.left = way.dx < 0;
      if (platformer) input.jump = way.dy < 0 || rng.chance(0.3);
      else {
        input.down = way.dy > 0;
        input.up = way.dy < 0;
      }
      for (const k of Object.keys(input) as Array<keyof InputState>) if (!keys.has(k)) input[k] = false;
      return input;
    }
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
    let stage = from.stage;
    const frames: InputFrame[] = [];
    const length = 15 + rng.int(burstMax);
    let input = emptyInput();
    let hold = 0;
    let tapped = false;
    for (let t = 0; t < length && explored < budget; t++) {
      if (hold <= 0) {
        // Taps alternate a short press with a release long enough for one grid step to finish.
        tapped = opts.taps === true && !tapped;
        input = opts.taps && !tapped ? emptyInput() : randomInput(stage);
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
        return { completed: proved, script: proved ? script : null, ticks: proved ? sim.tick : -1, explored, cells: archive.size, best: report(sim, stage) };
      }
      if (sim.world.flags.gameOver) break;
      stage = climb(stage);
      const key = keyAt(stage);
      const known = archive.get(key);
      const progress = progressAt(stage);
      if (!known || progress > known.progress || (progress === known.progress && (sim.world.score > known.score || (sim.world.score === known.score && sim.tick < known.tick)))) {
        // A burst that goes on from a new cell continues as that cell's child.
        const cell = add(key, from.id, frames.slice(), stage);
        if (cell.progress > best.progress || (cell.progress === best.progress && cell.score > best.score)) best = cell;
        frames.length = 0;
        frames.push({ tick: sim.tick, input: { ...input } });
        from = cell;
      } else known.seen++;
    }
  }
  // The most progressed moment still kept (a better one for the same cell takes the place of the one found first).
  for (const c of cells) if (c.live && (!best.live || c.progress > best.progress || (c.progress === best.progress && c.score > best.score))) best = c;
  if (best.save) sim.load(best.save);
  return { completed: false, script: null, ticks: -1, explored, cells: archive.size, best: report(sim, best.stage) };

  function report(s: Sim, stage?: number): ExploreResult['best'] {
    const ts = s.map.tileSize;
    const p = s.world.player;
    return {
      progress: Math.round(s.progress() * 100) / 100,
      score: s.world.score,
      hud: { ...s.world.hud },
      goalDistance: Math.round(goalDistance(s) * 10) / 10,
      at: { x: Math.floor(centerX(p) / ts), y: Math.floor(centerY(p) / ts) },
      ...(n > 0 && stage !== undefined ? { stage } : {}),
    };
  }
}
