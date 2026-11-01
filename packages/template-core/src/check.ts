import type { LevelJson, SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import type { ValidationReport } from '@gg/validators';
import { runBot } from './bots.js';
import type { BotResult, GenreCheck } from './manifest.js';
import { levelTicksOf, simOptionsFor, type SimOptionsInputs } from './sim-options.js';

export interface LevelCheck {
  /** Static validator passed and the solver bot completed the level (and the genre's fair bot, where it has one). */
  ok: boolean;
  report: ValidationReport;
  /** Null when the static validator already rejected the level. */
  solver: BotResult | null;
  /** The fair bot's run: null when the genre has none, or the solver already failed. */
  fair?: BotResult | null;
}

/**
 * The solvability oracle every level must pass: the genre's static validator under the game's feel preset, then
 * the solver bot over the real sim with the game's systems, behaviours and content, at the seed the level is played
 * with (level i of a game plays at levelSeed(DEFAULT_SEED, i); the first level's, 1, by default), for as long as the
 * game's rules let a level last (levelTicksOf); then, for a genre with a fair bot, that bot as well, playing as a person
 * would. Deterministic.
 */
export function checkLevel(
  kit: GenreCheck,
  level: LevelJson,
  systems: Pick<SystemsJson, 'feelPreset' | 'systems'>,
  inputs: SimOptionsInputs = {},
  opts: { seed?: number; maxTicks?: number } = {},
): LevelCheck {
  const feel =
    kit.runtime.feelPresets[systems.feelPreset] ??
    kit.runtime.feelPresets[kit.runtime.defaultFeel]!;
  const report = kit.validate(level, feel);
  if (!report.ok) return { ok: false, report, solver: null };
  const policy = kit.bots[kit.solverBot];
  if (!policy) throw new Error(`genre ${kit.runtime.id} has no solver bot '${kit.solverBot}'`);
  const options = simOptionsFor(kit.runtime, systems, inputs);
  const solver = runBot(createSim({ ...options, level, seed: opts.seed ?? 1 }), policy, opts.maxTicks ?? levelTicksOf(options));
  const fairPolicy = kit.fairBot ? kit.bots[kit.fairBot] : undefined;
  if (kit.fairBot && !fairPolicy) throw new Error(`genre ${kit.runtime.id} has no fair bot '${kit.fairBot}'`);
  const fair = fairPolicy && solver.completed ? runBot(createSim({ ...options, level, seed: opts.seed ?? 1 }), fairPolicy, opts.maxTicks ?? levelTicksOf(options)) : null;
  return { ok: solver.completed && (fair?.completed ?? true), report, solver, fair };
}
