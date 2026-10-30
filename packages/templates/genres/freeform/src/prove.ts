import type { BehaviourFsm, EcaRule, EntityRoster, FreeformSystemsJson, LevelJson, LevelProof } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed, type FeedbackBinding, type Sim } from '@gg/sdk';
import { explore, explorerOptionsFor, levelTicksOf, runBot, scriptFromLog, simOptionsFor, type BotPolicy } from '@gg/template-core';
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
}

export interface Proving {
  proof: LevelProof | null;
  /** What was tried, in order, and how it went. */
  tried: string[];
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
  const options = simOptionsFor(game.runtime, inputs.file, { behaviours: inputs.behaviours, rules: inputs.rules, content: inputs.content, feedback: inputs.feedback });
  const fresh = (): Sim => createSim({ ...options, level, seed });
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
      });
      const sim = createSim({ ...o, level: retypeLevel(level, plain.back), seed });
      const r = runBot(sim, inputs.solver, levelTicksOf(o));
      if (r.completed) {
        const script = scriptFromLog(sim, sim.tick);
        if (wins(script, sim.tick)) return { proof: { version: 1, level: level.id, seed, ticks: sim.tick, by: 'solver', script }, tried: [...tried, `solver: wins in ${sim.tick} ticks`] };
        tried.push('solver: won under the base names, but the run does not replay on the game');
      } else tried.push(`solver: no win in ${r.ticks} ticks (${r.deaths} deaths)`);
    }
  }
  const ex = explore(fresh, { budget: inputs.budget, ...explorerOptionsFor(Object.values(game.runtime.systems).map((m) => m.meta)) });
  if (ex.completed && ex.script) return { proof: { version: 1, level: level.id, seed, ticks: ex.ticks, by: 'explorer', script: ex.script }, tried: [...tried, `explorer: wins in ${ex.ticks} ticks (${ex.explored} explored)`] };
  return { proof: null, tried: [...tried, `explorer: no win in ${ex.explored} ticks (best progress ${ex.best.progress.toFixed(2)})`] };
}
