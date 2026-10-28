import { z } from 'zod';

export const FAILURE_MODES = [
  'spec_violation',
  'repetition',
  'context_loss',
  'premature_done',
  'no_verification',
  'wrong_verification',
  'api_misuse',
  'schema_invalid',
  'semantic_invalid',
  'budget',
  'infra',
] as const;
export const FailureMode = z.enum(FAILURE_MODES);
export type FailureMode = z.infer<typeof FailureMode>;

/** One sampled attempt at one stage; the unit of evals, optimization and distillation. */
export const Trajectory = z.object({
  jobId: z.string(),
  stage: z.string(),
  attempt: z.int().nonnegative(),
  sampleIdx: z.int().nonnegative(),
  runner: z.string(),
  provider: z.string(),
  model: z.string(),
  promptHash: z.string(),
  inputTokens: z.int().nonnegative(),
  cachedTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  passed: z.boolean(),
  gateReportPath: z.string().nullable(),
  failureMode: FailureMode.nullable(),
  artifactPath: z.string().nullable(),
  scrubbed: z.boolean().default(false),
});
export type Trajectory = z.infer<typeof Trajectory>;
