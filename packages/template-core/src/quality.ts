import type { GameEventRecord } from '@gg/schemas';
import { emptyInput, Rng, type InputSegment, type InputState, type Sim } from '@gg/sdk';
import { explore, explorerOptionsFor, type ExploreOptions } from './explore.js';

/**
 * Genre-free measures of whether a finishable level is also a fair one, for any game built on the SDK: how forgiving
 * its proof's timing is, whether it plays itself, whether mashing wins it, which verbs it needs, how much of its
 * feedback answers. Curated levels calibrate them (tools/evals quality); games nobody wrote a bot for are held to the
 * curated band.
 */

/** Keys a script may press; the pause key never counts. */
const KEYS: ReadonlyArray<keyof InputState> = ['left', 'right', 'up', 'down', 'jump', 'dash', 'action'];

/** Every change point of a script moved up to `amount` ticks either way, each segment keeping at least one tick. */
export function jitterScript(script: readonly InputSegment[], amount: number, rng: Rng): InputSegment[] {
  if (script.length === 0) return [];
  const bounds = script.map((s) => s.from);
  const end = script[script.length - 1]!.to;
  for (let i = 1; i < bounds.length; i++) {
    const moved = bounds[i]! + rng.int(2 * amount + 1) - amount;
    const lo = bounds[i - 1]! + 1;
    const hi = (script[i + 1]?.from ?? end) - 1;
    bounds[i] = Math.max(lo, Math.min(hi, moved));
  }
  return script.map((s, i) => ({ from: bounds[i]!, to: bounds[i + 1] ?? end, input: { ...s.input } }));
}

function wins(make: () => Sim, script: readonly InputSegment[], ticks: number): boolean {
  const sim = make();
  sim.run(script, ticks);
  return sim.world.flags.won;
}

/**
 * Share of jittered replays of a winning script that still win: how much slack the proof's timing has. The replay is
 * open-loop, so over a long reactive run (a minute among swarming enemies) small shifts compound and robustness comes
 * out low even on fair levels, where a player would react instead: compare a game with its own genre's band.
 *
 * A shift that only makes the run arrive later is no timing failure: each replay holds its last keys for as long as
 * its shifts could have cost (a moved change point trades at most `amount` ticks of one input for its neighbour's,
 * twice over to walk back), so a wandering run (the explorer's) is judged on what it hits, not on when it gets there.
 */
export function jitterRobustness(make: () => Sim, script: readonly InputSegment[], ticks: number, opts: { runs?: number; amount?: number; seed?: number } = {}): number {
  const runs = opts.runs ?? 12;
  const amount = opts.amount ?? 2;
  const rng = new Rng(opts.seed ?? 11);
  const slack = 4 * amount + 2 * amount * Math.max(0, script.length - 1);
  let won = 0;
  for (let i = 0; i < runs; i++) {
    const jittered = jitterScript(script, amount, rng);
    const last = jittered[jittered.length - 1];
    if (last) last.to += slack;
    if (wins(make, jittered, ticks + slack)) won++;
  }
  return won / runs;
}

/** Whether pressing nothing wins within `ticks`: a level that plays itself. */
export function afkWins(make: () => Sim, ticks: number): boolean {
  const sim = make();
  for (let t = 0; t < ticks && !sim.world.flags.won && !sim.world.flags.gameOver; t++) sim.step(emptyInput());
  return sim.world.flags.won;
}

/**
 * Share of runs of random held keys (changing every 6 to 30 ticks, from an own rng) that win within `ticks`: a level
 * that mashing finishes asks nothing of the player.
 */
export function randomWinRate(make: () => Sim, ticks: number, opts: { runs?: number; seed?: number; keys?: ReadonlyArray<keyof InputState> } = {}): number {
  const runs = opts.runs ?? 8;
  const keys = opts.keys ?? KEYS;
  const rng = new Rng(opts.seed ?? 13);
  let won = 0;
  for (let r = 0; r < runs; r++) {
    const sim = make();
    let input = emptyInput();
    let hold = 0;
    for (let t = 0; t < ticks && !sim.world.flags.won && !sim.world.flags.gameOver; t++) {
      if (hold-- <= 0) {
        input = emptyInput();
        for (const k of keys) if (rng.chance(0.3)) input[k] = true;
        hold = 6 + rng.int(25);
      }
      sim.step(input);
    }
    if (sim.world.flags.won) won++;
  }
  return won / runs;
}

/** A game's verbs from its systems' controls: keys that share a use, or share a key, form one verb ('move/aim'). */
export function verbsOf(systems: ReadonlyArray<{ controls?: Partial<Record<string, string>> }>): Record<string, Array<keyof InputState>> {
  const groups: Array<{ names: Set<string>; keys: Set<keyof InputState> }> = [];
  for (const s of systems) {
    for (const [key, use] of Object.entries(s.controls ?? {})) {
      if (!use || use === 'undo' || use === 'restart' || key === 'pause') continue;
      const k = key as keyof InputState;
      const hits = groups.filter((g) => g.names.has(use) || g.keys.has(k));
      const merged = { names: new Set([use, ...hits.flatMap((g) => [...g.names])]), keys: new Set([k, ...hits.flatMap((g) => [...g.keys])]) };
      for (const h of hits) groups.splice(groups.indexOf(h), 1);
      groups.push(merged);
    }
  }
  return Object.fromEntries(groups.map((g) => [[...g.names].sort().join('/'), KEYS.filter((k) => g.keys.has(k))]));
}

/**
 * Which verbs a level needs: for each, the explorer tries to finish without its keys. Needed means it found no way
 * within the budget (the explorer is not complete, so a verb it calls needed might be avoidable by a cleverer player).
 * Only meaningful for a level the explorer finishes with every key. Verbs that stand in for each other (a dash that
 * also carries the player sideways) each look optional when masked alone.
 */
export function verbsNeeded(make: () => Sim, verbs: Record<string, ReadonlyArray<keyof InputState>>, opts: ExploreOptions = {}): { needed: string[]; optional: string[] } {
  const all = opts.keys ?? KEYS;
  const needed: string[] = [];
  const optional: string[] = [];
  for (const [name, keys] of Object.entries(verbs)) {
    const without = all.filter((k) => !keys.includes(k));
    (explore(make, { ...opts, keys: without }).completed ? optional : needed).push(name);
  }
  return { needed, optional };
}

/** Every event a run emits, in order (the event bus keeps only a bounded history). */
export function recordEvents(sim: Sim, script: readonly InputSegment[], ticks: number): GameEventRecord[] {
  const out: GameEventRecord[] = [];
  const off = sim.events.on('*', (ev) => out.push(ev));
  sim.run(script, ticks);
  off();
  return out;
}

/** Gameplay events a player expects to feel: one that fires without any binding in the feedback table goes unnoticed. */
export const SALIENT_EVENTS = ['hit', 'death', 'pickup', 'jump', 'dash', 'checkpoint', 'push', 'level_complete'];

/**
 * How much of a run's feedback answers: of the table's events that fired, the share answered within the window by one
 * of their channels, and the salient events that fired with no binding at all.
 */
export function feedbackCoverage(events: readonly GameEventRecord[], table: ReadonlyArray<{ event: string; channels: readonly string[] }>, windowTicks = 6): { fired: number; answered: number; unbound: string[] } {
  const answers = new Map<number, GameEventRecord[]>();
  for (const e of events) if (e.name === 'feedback' || e.name === 'audio_play') answers.set(e.tick, [...(answers.get(e.tick) ?? []), e]);
  let fired = 0;
  let answered = 0;
  for (const fe of table) {
    for (const occ of events) {
      if (occ.name !== fe.event) continue;
      fired++;
      let found = false;
      for (let t = occ.tick; t <= occ.tick + windowTicks && !found; t++) {
        for (const f of answers.get(t) ?? []) {
          if (f.name === 'audio_play' ? fe.channels.includes('sfx') : fe.channels.includes(String(f.payload['channel']))) found = true;
        }
      }
      if (found) answered++;
    }
  }
  const bound = new Set(table.map((f) => f.event));
  const unbound = SALIENT_EVENTS.filter((name) => !bound.has(name) && events.some((e) => e.name === name));
  return { fired, answered, unbound };
}

/** Spearman rank correlation of values with their order: 1 when every value is higher than the one before. */
export function rankCorrelation(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const ranks = (xs: readonly number[]) => {
    const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j++;
      for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const a = ranks(values.map((_, i) => i));
  const b = ranks(values);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / n;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** The measures of one level, from a winning script (a solver bot's run, the explorer's, a person's). */
export interface LevelQuality {
  /** Length of the winning run, in ticks. */
  proofTicks: number;
  /** The explorer, with no genre knowledge: whether it finished within the budget, and after how many ticks of search. */
  explorer: { found: boolean; explored: number };
  /** Share of jittered replays of the proof that still win. */
  jitter: number;
  /** Doing nothing wins. */
  afkWins: boolean;
  /** Share of random-key runs that win. */
  randomWins: number;
  /**
   * Verbs the level needs and those it can be finished without. Measured only when the explorer finishes the level with
   * every key: otherwise every masked run fails too, and every verb would look needed.
   */
  verbs: { measured: boolean; needed: string[]; optional: string[] };
  /** Feedback over the proof's run: events fired and answered, salient events with no binding. */
  feedback: { fired: number; answered: number; unbound: string[] };
}

export interface LevelQualityOptions {
  /** The game's systems' metadata, for its verbs and the explorer's keys. */
  systems: ReadonlyArray<{ controls?: Partial<Record<string, string>> }>;
  /** The game's feedback table (design/feedback.json). */
  feedback: ReadonlyArray<{ event: string; channels: readonly string[] }>;
  /** Explorer budget for finding a win and for each verb (default 40 000 ticks). */
  budget?: number;
  /** Skip the verb search (the costliest measure). */
  skipVerbs?: boolean;
}

export function levelQuality(make: () => Sim, proof: { script: readonly InputSegment[]; ticks: number }, opts: LevelQualityOptions): LevelQuality {
  const budget = opts.budget ?? 40_000;
  const keyOpts = explorerOptionsFor(opts.systems);
  const ex = explore(make, { budget, ...keyOpts });
  const horizon = Math.max(proof.ticks * 2, 600);
  return {
    proofTicks: proof.ticks,
    explorer: { found: ex.completed, explored: ex.explored },
    jitter: jitterRobustness(make, proof.script, proof.ticks),
    afkWins: afkWins(make, horizon),
    randomWins: randomWinRate(make, horizon, { keys: keyOpts.keys }),
    verbs: opts.skipVerbs || !ex.completed ? { measured: false, needed: [], optional: [] } : { measured: true, ...verbsNeeded(make, verbsOf(opts.systems), { budget, ...keyOpts }) },
    feedback: feedbackCoverage(recordEvents(make(), proof.script, proof.ticks), opts.feedback),
  };
}
