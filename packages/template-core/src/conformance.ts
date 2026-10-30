import type { GameEventRecord, LevelJson, Mechanic } from '@gg/schemas';
import { createSim, emptyInput, Rng, type InputState, type Sim, type SimCtx, type SimOptions, type SystemDef } from '@gg/sdk';
import { err, report, warn, type Issue, type ValidationReport } from '@gg/validators';
import { runBot } from './bots.js';
import type { BotPolicy } from './manifest.js';
import { afkWins, randomWinRate } from './quality.js';

/** A contract as the check reads it: design/mechanics.json's entry for one bespoke system. */
export type MechanicContract = Pick<Mechanic, 'id' | 'controls' | 'provides'> & { emits?: readonly string[]; hud?: readonly string[] };

/** What one system did while it ran. */
interface Seen {
  emits: Set<string>;
  spawns: Set<string>;
  hud: Set<string>;
  keys: Set<string>;
  won: boolean;
  gameOver: boolean;
  /** Microseconds of each call. */
  micros: number[];
}

const fresh = (): Seen => ({ emits: new Set(), spawns: new Set(), hud: new Set(), keys: new Set(), won: false, gameOver: false, micros: [] });

/** The watched system running now, and the first that threw. */
interface Current {
  id: string | null;
  crashed: string | null;
}

/**
 * The systems, with every call of a watched one put down to it: the events emitted while it runs (the bus hands them
 * to listeners as they are emitted), the types it spawns, the HUD keys it changes, the keys it reads (a proxy over the
 * input), the won and game-over flags it sets, and the time it takes.
 */
function watched(systems: readonly SystemDef<unknown>[], ids: ReadonlySet<string>, seen: Map<string, Seen>, current: Current): SystemDef<unknown>[] {
  const rec = (id: string): Seen => {
    let r = seen.get(id);
    if (!r) seen.set(id, (r = fresh()));
    return r;
  };
  const around = (id: string, ctx: SimCtx, call: () => void) => {
    const hud = { ...ctx.world.hud };
    const flags = { ...ctx.world.flags };
    current.id = id;
    const t0 = performance.now();
    try {
      call();
    } catch (e) {
      current.crashed ??= id;
      throw e;
    } finally {
      rec(id).micros.push((performance.now() - t0) * 1000);
      current.id = null;
    }
    for (const [k, v] of Object.entries(ctx.world.hud)) if (hud[k] !== v) rec(id).hud.add(k);
    if (ctx.world.flags.won && !flags.won) rec(id).won = true;
    if (ctx.world.flags.gameOver && !flags.gameOver) rec(id).gameOver = true;
  };
  return systems.map((s) => {
    if (!ids.has(s.id)) return s;
    const spy = (input: InputState) =>
      new Proxy(input, {
        get(t, k, r) {
          if (typeof k === 'string' && k in t) rec(s.id).keys.add(k);
          return Reflect.get(t, k, r) as unknown;
        },
      });
    return {
      ...s,
      fixedUpdate: (state, input, ctx) => around(s.id, ctx, () => s.fixedUpdate(state, spy(input), ctx)),
      onEvent: s.onEvent ? (state: unknown, ev: GameEventRecord, ctx: SimCtx) => around(s.id, ctx, () => s.onEvent!(state, ev, ctx)) : undefined,
    };
  });
}

/** Held random keys, changed every 6 to 30 ticks, from an own rng: the same inputs every time. */
function inputs(ticks: number, seed: number): InputState[] {
  const rng = new Rng(seed);
  const keys = ['left', 'right', 'up', 'down', 'jump', 'dash', 'action'] as const;
  const out: InputState[] = [];
  let input = emptyInput();
  let hold = 0;
  for (let t = 0; t < ticks; t++) {
    if (hold-- <= 0) {
      input = emptyInput();
      for (const k of keys) if (rng.chance(0.3)) input[k] = true;
      hold = 6 + rng.int(25);
    }
    out.push(input);
  }
  return out;
}

const play = (sim: Sim, steps: readonly InputState[]) => {
  for (const input of steps) sim.step(input);
};

/** A game saved halfway and loaded into a new one goes on exactly as the run it was saved from. */
function saveLoad(make: () => Sim, steps: readonly InputState[]): Issue[] {
  const half = Math.floor(steps.length / 2);
  const a = make();
  play(a, steps.slice(0, half));
  let save;
  try {
    save = a.save();
  } catch (e) {
    return [err('state_unsaveable', `the game cannot be saved: ${(e as Error).message}. A system's state must be plain data`)];
  }
  play(a, steps.slice(half));
  const b = make();
  b.load(save);
  play(b, steps.slice(half));
  return a.hash() === b.hash() ? [] : [err('save_load', "a game loaded from a save drifts from the run it was saved from: some state lives outside the systems' state objects")];
}

/** Two games stepped turn about play exactly as one alone does: they share no state (a module-level variable, a cache). */
function interleaved(make: () => Sim, steps: readonly InputState[]): Issue[] {
  const alone = make();
  play(alone, steps);
  const a = make();
  const b = make();
  for (const input of steps) {
    a.step(input);
    b.step(input);
  }
  return a.hash() === alone.hash() && b.hash() === alone.hash() ? [] : [err('shared_state', 'two games running side by side play differently from one alone: a system keeps state outside its state object')];
}

const p95 = (xs: readonly number[]) => (xs.length === 0 ? 0 : [...xs].sort((x, y) => x - y)[Math.floor(0.95 * (xs.length - 1))]!);

export interface ConformanceOptions {
  /** The game as it plays: its systems, bespoke ones among them. */
  options: Omit<SimOptions, 'level' | 'seed'>;
  /** Its levels, each with the seed it is played at. */
  levels: ReadonlyArray<{ level: LevelJson; seed: number }>;
  /** design/mechanics.json's contracts. */
  contracts: readonly MechanicContract[];
  /** The ids of the game's bespoke systems: each needs a contract. */
  bespoke: readonly string[];
  /** Bots that play each level while the systems are watched: the one that proves it, and chaos. */
  bots: Readonly<Record<string, BotPolicy>>;
  /** How long each bot plays a level. */
  ticks: number;
  /** Microseconds a bespoke system may take a call (p95) before it is a warning; four times that is an error. */
  budgetMicros?: number;
}

/**
 * A game's bespoke systems against their contracts, in the game's own test, with its own code: each does what its
 * contract says and nothing more (events, spawned types and that they are the game's, HUD keys, keys read, the win and
 * the game over); a system that owns the win reports its progress; the game saves and loads, never shares state
 * between two runs, is not won by standing still (and is warned of when random keys win it); each call keeps to the
 * time budget.
 */
export function conformance(o: ConformanceOptions): ValidationReport {
  const issues: Issue[] = [];
  const contracts = new Map(o.contracts.map((c) => [c.id, c]));
  for (const id of o.bespoke) if (!contracts.has(id)) issues.push(err('no_contract', `bespoke system '${id}' has no contract in design/mechanics.json`, { path: id }));
  for (const c of o.contracts) if (!o.bespoke.includes(c.id)) issues.push(err('contract_unused', `design/mechanics.json describes '${c.id}', which the game does not run`, { path: c.id }));
  const ids = new Set(o.bespoke.filter((id) => contracts.has(id)));
  const types = new Set((o.options.entityDefs ?? []).map((d) => d.type));

  const seen = new Map<string, Seen>();
  const current: Current = { id: null, crashed: null };
  for (const { level, seed } of o.levels) {
    for (const [name, bot] of Object.entries(o.bots)) {
      const sim = createSim({ ...o.options, systems: watched(o.options.systems, ids, seen, current), level, seed });
      sim.events.on('*', (ev) => {
        if (!current.id) return;
        const r = seen.get(current.id)!;
        r.emits.add(ev.name);
        if (ev.name === 'spawn') r.spawns.add(String(ev.payload['type']));
      });
      try {
        runBot(sim, bot, o.ticks);
      } catch (e) {
        const who = current.crashed ? `${current.crashed} stopped the game` : 'the game stopped';
        issues.push(err('crash', `${who} on ${level.id} at tick ${sim.tick} (${name} playing): ${(e as Error).message}`, current.crashed ? { path: current.crashed } : {}));
        current.crashed = null;
        current.id = null;
      }
    }
  }

  const budget = o.budgetMicros ?? 250;
  for (const id of ids) {
    const c = contracts.get(id)!;
    const r = seen.get(id) ?? fresh();
    const undeclared = (code: string, does: string, got: Iterable<string>, allowed: readonly string[]) => {
      const extra = [...got].filter((x) => !allowed.includes(x)).sort();
      if (extra.length) issues.push(err(code, `${id} ${does} ${extra.join(', ')}, which its contract does not name`, { path: id }));
    };
    undeclared('undeclared_emit', 'emits', r.emits, c.emits ?? []);
    undeclared('undeclared_spawn', 'spawns', r.spawns, c.provides?.spawns ?? []);
    undeclared('undeclared_hud', 'writes the HUD keys', r.hud, c.hud ?? []);
    undeclared('undeclared_key', 'reads the keys', r.keys, Object.keys(c.controls ?? {}));
    for (const t of [...r.spawns].sort()) if (!types.has(t)) issues.push(err('spawn_unknown', `${id} spawns '${t}', which the game has no entity for`, { path: id }));
    if (r.won && !c.provides?.win) issues.push(err('undeclared_win', `${id} wins the level, but its contract claims no win`, { path: id }));
    if (r.gameOver && c.provides?.death !== 'game_over' && c.provides?.death !== 'lives') issues.push(err('undeclared_game_over', `${id} ends the run, but its contract claims no death rule that does`, { path: id }));
    if (c.provides?.win && !o.options.systems.find((s) => s.id === id)?.progress) issues.push(err('no_progress', `${id} owns the win but reports no progress: bots and the explorer cannot steer toward it`, { path: id }));
    const slow = p95(r.micros);
    if (slow > budget * 4) issues.push(err('slow', `${id} takes ${Math.round(slow)} µs a call (p95), more than ${budget * 4}`, { path: id }));
    else if (slow > budget) issues.push(warn('slow', `${id} takes ${Math.round(slow)} µs a call (p95), more than ${budget}`, { path: id }));
  }

  // What any system can break for the whole game, checked on its first level.
  const first = o.levels[0];
  let random = 0;
  if (first) {
    const make = () => createSim({ ...o.options, level: first.level, seed: first.seed });
    const steps = inputs(Math.min(o.ticks, 1200), 7);
    // A game that stops under random keys has been reported by the runs above; here it only ends the check.
    const guarded = (check: () => Issue[]): Issue[] => {
      try {
        return check();
      } catch (e) {
        return [err('crash', `the game stopped under random keys: ${(e as Error).message}`)];
      }
    };
    issues.push(...guarded(() => saveLoad(make, steps)), ...guarded(() => interleaved(make, steps)));
    issues.push(
      ...guarded(() => {
        random = randomWinRate(make, Math.min(o.ticks, 3600), { runs: 6 });
        return [
          ...(afkWins(make, Math.min(o.ticks, 3600)) ? [err('afk_wins', 'standing still wins the first level')] : []),
          ...(random > 0 ? [warn('random_wins', `random keys win the first level in ${Math.round(random * 100)}% of runs: it asks little of the player`)] : []),
        ];
      }),
    );
  }
  return report(issues, { watched: ids.size, levels: o.levels.length, randomWins: random });
}
