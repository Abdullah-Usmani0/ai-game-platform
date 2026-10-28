import { z } from 'zod';

export const STAGES = [
  'gdd',
  'systems',
  'behaviour',
  'implement',
  'levels',
  'integrate',
  'playtest',
  'juice',
  'review',
] as const;
export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

export const Runner = z.enum(['claude-sdk', 'open', 'structured']);
export type Runner = z.infer<typeof Runner>;

export const StagePolicy = z.object({
  runner: Runner,
  provider: z.string(),
  model: z.string(),
  effort: z.enum(['low', 'medium', 'high']).default('medium'),
  k: z.int().min(1).max(32).default(1),
  repairRounds: z.int().min(0).max(5).default(2),
  escalateTo: z.object({ provider: z.string(), model: z.string(), effort: z.enum(['low', 'medium', 'high']) }).optional(),
  caps: z.object({ turns: z.int().min(0), usd: z.number().min(0), wallMin: z.number().min(0) }),
});
export type StagePolicy = z.infer<typeof StagePolicy>;

/** Versioned per-stage model policy. */
export const ModelPolicy = z.object({
  version: z.int().positive(),
  name: z.string(),
  stages: z.partialRecord(Stage, StagePolicy),
  jobCaps: z.object({ softUsd: z.number().min(0), hardUsd: z.number().min(0), providerUsd: z.number().min(0), wallMin: z.number().min(0) }),
});
export type ModelPolicy = z.infer<typeof ModelPolicy>;
