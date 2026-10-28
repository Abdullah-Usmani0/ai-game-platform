import { z } from 'zod';
import { BehaviourFsm, EcaRule } from './behaviour.js';
import { BundleManifest } from './bundle.js';
import { GameToHost, HostToGame, StateSnapshot } from './bridge.js';
import { GddFrontmatter } from './gdd.js';
import { LevelJson } from './level.js';
import { GateReport, PlaytestReport } from './playtest.js';
import { ModelPolicy } from './policy.js';
import { StyleCard } from './style.js';
import { SystemsJson } from './systems.js';
import { Trajectory } from './trajectory.js';
import { WaveTable } from './waves.js';

export * from './common.js';
export * from './events.js';
export * from './style.js';
export * from './systems.js';
export * from './gdd.js';
export * from './level.js';
export * from './behaviour.js';
export * from './waves.js';
export * from './playtest.js';
export * from './bundle.js';
export * from './bridge.js';
export * from './policy.js';
export * from './trajectory.js';

/** Every artifact schema by name, for JSON Schema export and structured-output calls. */
export const ARTIFACT_SCHEMAS = {
  StyleCard,
  SystemsJson,
  GddFrontmatter,
  LevelJson,
  BehaviourFsm,
  EcaRule,
  WaveTable,
  PlaytestReport,
  GateReport,
  BundleManifest,
  StateSnapshot,
  GameToHost,
  HostToGame,
  ModelPolicy,
  Trajectory,
} as const;
export type ArtifactName = keyof typeof ARTIFACT_SCHEMAS;

/** JSON Schema (draft 2020-12) for a named artifact. Used for provider structured outputs. */
export function toJsonSchema(name: ArtifactName): Record<string, unknown> {
  return z.toJSONSchema(ARTIFACT_SCHEMAS[name], { target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>;
}
