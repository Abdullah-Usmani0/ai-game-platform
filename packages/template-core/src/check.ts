import type { LevelJson, SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import type { ValidationReport } from '@gg/validators';
import { runBot } from './bots.js';
import type { BotResult, GenreCheck } from './manifest.js';
import { simOptionsFor, type SimOptionsInputs } from './sim-options.js';

export interface LevelCheck {
  /** Static validator passed and the solver bot completed the level. */
  ok: boolean;
  report: ValidationReport;
  /** Null when the static validator already rejected the level. */
  solver: BotResult | null;
}

/**
 * The solvability oracle every level must pass: the genre's static validator under the game's feel preset, then
 * the solver bot over the real sim with the game's systems, behaviours and content, at the seed the level is played
 * with (level i of a game plays at levelSeed(DEFAULT_SEED, i); the first level's, 1, by default). Deterministic.
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
  const solver = runBot(
    createSim({ ...simOptionsFor(kit.runtime, systems, inputs), level, seed: opts.seed ?? 1 }),
    policy,
    opts.maxTicks ?? 90 * 60,
  );
  return { ok: solver.completed, report, solver };
}
