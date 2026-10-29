import { z } from 'zod';
import { BehaviourFsm, EcaRule } from './behaviour';
import { BundleManifest } from './bundle';
import { GameToHost, HostToGame, StateSnapshot } from './bridge';
import { GddFrontmatter } from './gdd';
import { CreateRequest, EditRequest, EditRoute } from './jobs';
import { LevelJson } from './level';
import { GateReport, PlaytestReport } from './playtest';
import { ModelPolicy } from './policy';
import { StyleCard } from './style';
import { SystemsJson } from './systems';
import { Trajectory } from './trajectory';
import { WaveTable } from './waves';

export * from './common';
export * from './events';
export * from './style';
export * from './systems';
export * from './gdd';
export * from './level';
export * from './behaviour';
export * from './waves';
export * from './playtest';
export * from './bundle';
export * from './bridge';
export * from './policy';
export * from './trajectory';
export * from './jobs';
export * from './community';

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
  CreateRequest,
  EditRoute,
  EditRequest,
} as const;
export type ArtifactName = keyof typeof ARTIFACT_SCHEMAS;

/** JSON Schema (draft 2020-12) for a named artifact. Used for provider structured outputs. */
export function toJsonSchema(name: ArtifactName): Record<string, unknown> {
  return z.toJSONSchema(ARTIFACT_SCHEMAS[name], { target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>;
}
