import type { FreeformSystemsJson } from '@gg/schemas';
import { EXPERT_SHARE, type LevelGenParams } from '@gg/template-core';
import { runLevelLength } from '@gg/template-platformer';
import { RUNTIMES } from './registry.js';

/**
 * What a freeform game's systems ask of its levels' generator besides the seed, the difficulty and the boss: a runner
 * never stops, so its levels are as long as it runs in the time an expert takes (EXPERT_SHARE of the GDD's level time),
 * where the base grammar's usual length would be over in seconds. Nothing for any other game.
 */
export function generatorParams(file: FreeformSystemsJson, levelTimeS: number): Partial<LevelGenParams> {
  const run = file.systems.find((s) => s.id === 'auto-run');
  if (!run) return {};
  const base = RUNTIMES[file.composition.base];
  const feel = base.feelPresets[file.feelPreset] ?? base.feelPresets[base.defaultFeel]!;
  return { length: runLevelLength(run.params, feel, levelTimeS * EXPERT_SHARE) };
}
