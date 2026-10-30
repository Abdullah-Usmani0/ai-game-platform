import { z } from 'zod';
import { GameEventRecord } from './events';

export const BotResult = z.object({
  bot: z.string(),
  seed: z.int(),
  ticks: z.int().nonnegative(),
  completed: z.boolean(),
  deaths: z.int().nonnegative(),
  stuckMaxTicks: z.int().nonnegative(),
  crashes: z.array(z.string()).default([]),
  finalHash: z.string(),
  metrics: z.record(z.string(), z.number()).default({}),
});
export type BotResult = z.infer<typeof BotResult>;

export const PlaytestReport = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  seeds: z.array(z.int()),
  bots: z.array(BotResult),
  consoleErrors: z.array(z.string()).default([]),
  /** Semantic event history of the manual run (bounded by the SDK ring buffer); the juice linter's input. */
  events: z.array(GameEventRecord).default([]),
  readyMs: z.number().nonnegative().optional(),
  replayHashMatch: z.boolean().optional(),
  /** What the view could not draw as the game asked: its own designs that fell back to the shipped sprite, types drawn as placeholder shapes. */
  draws: z.object({ designs: z.int().min(0), designFallbacks: z.array(z.string()), blobFallbacks: z.array(z.string()) }).optional(),
  passed: z.boolean(),
  failures: z.array(z.string()).default([]),
});
export type PlaytestReport = z.infer<typeof PlaytestReport>;

export const GateReport = z.object({
  stage: z.string(),
  passed: z.boolean(),
  stalled: z.boolean().default(false),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string().default('') })),
  durationMs: z.number().nonnegative(),
});
export type GateReport = z.infer<typeof GateReport>;
