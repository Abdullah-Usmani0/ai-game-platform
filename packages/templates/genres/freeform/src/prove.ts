import type { BehaviourFsm, EcaRule, EntityRoster, FreeformSystemsJson, LevelHints, LevelJson, LevelProof, Mechanic } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed, type FeedbackBinding, type Sim, type SystemDef } from '@gg/sdk';
import { afkWins, explore, explorerOptionsFor, levelTicksOf, runBot, scriptFromLog, simOptionsFor, subgoalsFrom, type BotPolicy } from '@gg/template-core';
import { blockBots } from './blocks.js';
import { compose, type Composed } from './compose.js';
import { inverse, retypeContent, retypeFsm, retypeLevel, retypeRule, type Rename } from './retype.js';

export interface ProveInputs {
  file: FreeformSystemsJson;
  roster: EntityRoster;
  behaviours?: BehaviourFsm[];
  rules?: EcaRule[];
  content?: Record<string, unknown>;
  feedback?: FeedbackBinding[];
  /** The base genre's solver bot: it knows the base genre's names, so it plays the game under them. */
  solver?: BotPolicy;
  /** Ticks the explorer may spend on a level (default 150 000). */
  budget?: number;
  /** The game's bespoke systems (its own code, run by its own test), and their contracts: the keys they read. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bespoke?: SystemDef<any>[];
  mechanics?: readonly Mechanic[];
  /** The level's hints (content/hints/<level>.json): steps toward the win the explorer climbs in order. */
  hints?: LevelHints;
}

export interface Proving {
  proof: LevelProof | null;
  /** What was tried, in order, and how it went. */
  tried: string[];
  /**
   * Where the explorer got stuck when nothing won: how far it got by the game's own account (and through the hints'
   * steps), what the HUD said and where the player stood. What a hint writer starts from.
   */
  stuck?: ReturnType<typeof explore>['best'];
}

/** A fresh sim of a level of the game, at the seed it is played with, and the longest the level lasts. */
function gameSim(level: LevelJson, index: number, inputs: ProveInputs, game = compose(inputs.file, inputs.roster)): { make: () => Sim; levelTicks: number } {
  const options = simOptionsFor(game.runtime, inputs.file, { behaviours: inputs.behaviours, rules: inputs.rules, content: inputs.content, feedback: inputs.feedback, bespoke: inputs.bespoke });
  const seed = levelSeed(DEFAULT_SEED, index);
  return { make: () => createSim({ ...options, level, seed }), levelTicks: levelTicksOf(options) };
}

/**
 * Whether standing still wins a level, given as long as twice its winning run takes (ten seconds at least), or the whole
 * level when it has no winning run yet: a level that plays itself asks nothing of the player (a runner's with nothing
 * in the way, a survival nothing can reach). The levels stage never ships one.
 */
export function idleWins(level: LevelJson, index: number, inputs: ProveInputs, winTicks?: number): boolean {
  const g = gameSim(level, index, inputs);
  return afkWins(g.make, winTicks === undefined ? g.levelTicks : Math.max(600, winTicks * 2));
}

/** The same game under the base genre's names: the roster's entities and tuning, each named as it ships. */
function underBaseNames(inputs: ProveInputs, game: Composed): { composed: Composed; back: Rename } | null {
  const back = inverse(new Map([...game.roster.typeOf].map(([archetype, type]) => [archetype.slice(archetype.indexOf(':') + 1), type])));
  const plain = compose(inputs.file, { ...inputs.roster, types: inputs.roster.types.map((t) => ({ ...t, type: t.archetype.slice(t.archetype.indexOf(':') + 1) })) });
  // Two shipped entities with one name (a survivors brute and a top-down brute) cannot both go back to it.
  return plain.issues.length === 0 && back.size === game.roster.typeOf.size ? { composed: plain, back } : null;
}

/**
 * Finds a run that wins a level at the seed it is played with, the evidence that it can be finished: the stored proof
 * if it still wins, else the base genre's solver playing the game under the base names (its run replays on the
 * game's names move for move), else the explorer. Every proof is replayed on a fresh sim before it is returned.
 */
export function proveLevel(level: LevelJson, index: number, inputs: ProveInputs, stored?: LevelProof): Proving {
  const seed = levelSeed(DEFAULT_SEED, index);
  const game = compose(inputs.file, inputs.roster);
  const fresh = gameSim(level, index, inputs, game).make;
  const wins = (script: LevelProof['script'], ticks: number) => {
    const sim = fresh();
    sim.run(script, ticks);
    return sim.world.flags.won;
  };
  const tried: string[] = [];
  if (stored) {
    if (stored.seed === seed && wins(stored.script, stored.ticks)) return { proof: stored, tried: ['stored proof: wins'] };
    tried.push('stored proof: no longer wins');
  }
  if (inputs.solver) {
    const plain = underBaseNames(inputs, game);
    if (!plain) tried.push('solver: two entities share a shipped name, so the game has no base-name twin');
    else {
      const o = simOptionsFor(plain.composed.runtime, inputs.file, {
        behaviours: inputs.behaviours?.map((b) => retypeFsm(b, plain.back)),
        rules: inputs.rules?.map((r) => retypeRule(r, plain.back)),
        content: retypeContent(inputs.content ?? {}, plain.back),
        feedback: inputs.feedback,
        bespoke: inputs.bespoke,
      });
      const sim = createSim({ ...o, level: retypeLevel(level, plain.back), seed });
      try {
        const r = runBot(sim, inputs.solver, levelTicksOf(o));
        if (r.completed) {
          const script = scriptFromLog(sim, sim.tick);
          if (wins(script, sim.tick)) return { proof: { version: 1, level: level.id, seed, ticks: sim.tick, by: 'solver', script }, tried: [...tried, `solver: wins in ${sim.tick} ticks`] };
          tried.push('solver: won under the base names, but the run does not replay on the game');
        } else tried.push(`solver: no win in ${r.ticks} ticks (${r.deaths} deaths)`);
      } catch (e) {
        // The game's own code may know its own names only (it spawns a 'wasp', which the base calls a chaser).
        tried.push(`solver: the game under the base names stopped (${(e as Error).message})`);
      }
    }
  }
  // The bots the game's blocks bring play their jobs on the game as it is, under its own names (the courier).
  for (const [name, bot] of Object.entries(blockBots(inputs.file))) {
    const sim = fresh();
    const r = runBot(sim, bot, levelTicksOf(sim.options));
    if (!r.completed) {
      tried.push(`${name}: no win in ${r.ticks} ticks (${r.deaths} deaths)`);
      continue;
    }
    const script = scriptFromLog(sim, sim.tick);
    if (wins(script, sim.tick)) return { proof: { version: 1, level: level.id, seed, ticks: sim.tick, by: 'bot', script }, tried: [...tried, `${name}: wins in ${sim.tick} ticks`] };
    tried.push(`${name}: won, but the run does not replay`);
  }
  // With the level's hints the explorer climbs their steps in order; without, the game's own progress guides it alone.
  const steps = inputs.hints?.steps ?? [];
  const who = steps.length > 0 ? `explorer with ${steps.length} hints` : 'explorer';
  const ex = explore(fresh, {
    budget: inputs.budget,
    ...explorerOptionsFor([...Object.values(game.runtime.systems).map((m) => m.meta), ...(inputs.mechanics ?? [])]),
    ...(steps.length > 0 ? { subgoals: subgoalsFrom(steps) } : {}),
  });
  if (ex.completed && ex.script) return { proof: { version: 1, level: level.id, seed, ticks: ex.ticks, by: 'explorer', script: ex.script }, tried: [...tried, `${who}: wins in ${ex.ticks} ticks (${ex.explored} explored)`] };
  const reached = steps.length > 0 ? `${ex.best.stage ?? 0} of ${steps.length} steps, ` : '';
  return { proof: null, tried: [...tried, `${who}: no win in ${ex.explored} ticks (best: ${reached}progress ${ex.best.progress.toFixed(2)} at ${ex.best.at.x},${ex.best.at.y})`], stuck: ex.best };
}
