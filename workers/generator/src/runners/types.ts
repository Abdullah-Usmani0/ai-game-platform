import type { FailureMode, StagePolicy } from '@gg/schemas';
import type { Store } from '@gg/db';
import type { Usage } from '@gg/llm';

/** One stage of a job as the worker executes it. The gate list and write scope land in stage.json. */
export interface StageSpec {
  stage: string;
  /** 'none' = gate only (used for smoke/demo stages); otherwise resolved from the policy unless overridden. */
  runner?: 'claude-sdk' | 'open' | 'structured' | 'none';
  model?: string;
  provider?: string;
  gate: string[];
  allowedWrite?: string[];
  seeds?: number[];
  ticks?: number;
  /** Free-text task for agent runners, or the artifact request for structured runners. */
  task?: string;
  artifact?: { name: string; outPath: string; system?: string };
}

export interface StageContext {
  jobId: string;
  gameId: string;
  spec: StageSpec;
  attempt: number;
  workDir: string;
  gameDir: string;
  policy: StagePolicy | null;
  model: string;
  provider: string;
  store: Store;
  log(message: string): void;
}

export interface StageOutcome {
  ok: boolean;
  summary: string;
  usage: Usage;
  costUsd: number;
  durationMs: number;
  turns: number;
  failureMode?: FailureMode;
  artifactPath?: string;
  promptHash?: string;
}

export interface Runner {
  readonly kind: 'claude-sdk' | 'open' | 'structured' | 'none';
  run(ctx: StageContext): Promise<StageOutcome>;
}
