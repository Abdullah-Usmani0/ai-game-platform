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
 * the solver bot over the real sim with the game's systems, behaviours and content. Deterministic (seed 1).
 */
export function checkLevel(
  kit: GenreCheck,
  level: LevelJson,
  systems: SystemsJson,
  inputs: SimOptionsInputs = {},
  maxTicks = 90 * 60,
): LevelCheck {
  const feel =
    kit.runtime.feelPresets[systems.feelPreset] ??
    kit.runtime.feelPresets[kit.runtime.defaultFeel]!;
  const report = kit.validate(level, feel);
  if (!report.ok) return { ok: false, report, solver: null };
  const policy = kit.bots[kit.solverBot];
  if (!policy) throw new Error(`genre ${kit.runtime.id} has no solver bot '${kit.solverBot}'`);
  const solver = runBot(
    createSim({ ...simOptionsFor(kit.runtime, systems, inputs), level, seed: 1 }),
    policy,
    maxTicks,
  );
  return { ok: solver.completed, report, solver };
}
