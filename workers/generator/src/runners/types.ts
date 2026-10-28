import type { CreateRequest, EditRoute, FailureMode, StagePolicy } from '@gg/schemas';
import type { Store } from '@gg/db';
import type { Usage } from '@gg/llm';

/** One stage of a job as the worker executes it. The gate list and write scope land in stage.json. */
export interface StageSpec {
  stage: string;
  /** 'none' = gate only; 'worker' = implemented in the worker (structured calls or pure code); otherwise from the policy. */
  runner?: 'claude-sdk' | 'open' | 'structured' | 'none' | 'worker';
  model?: string;
  provider?: string;
  gate: string[];
  allowedWrite?: string[];
  seeds?: number[];
  ticks?: number;
  /** Free-text task for agent runners, or the artifact request for structured runners. */
  task?: string;
  artifact?: { name: string; outPath: string; system?: string };
  /** Skills the stage's agent session should read first (from the stage preset). */
  skills?: string[];
  caps?: { turns: number; usd: number; wallMin: number };
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
  /** True when no model is called: agent stages are skipped and the fake provider answers structured calls. */
  dryRun: boolean;
  /** The create request for create jobs. */
  request: CreateRequest | null;
  /** The resolved edit route for edit jobs. */
  route: EditRoute | null;
  /** The id the version row gets if this attempt passes its gate (the publisher names the bundle after it). */
  versionId: string;
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
  /** Fields the version row records when the stage passes (the publisher fills them). */
  version?: { bundlePath?: string | null; manifest?: Record<string, unknown> | null; design?: Record<string, unknown>; contentHash?: string | null };
}

export interface Runner {
  readonly kind: 'claude-sdk' | 'open' | 'structured' | 'none' | 'worker';
  run(ctx: StageContext): Promise<StageOutcome>;
}
