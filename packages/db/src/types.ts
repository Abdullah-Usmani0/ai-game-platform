import type { ModelPolicy, Trajectory } from '@gg/schemas';

export type JobKind = 'create' | 'edit_parameter' | 'edit_style' | 'edit_behaviour' | 'edit_content' | 'edit_code' | 'remix' | 'republish';
export type JobStatus = 'queued' | 'running' | 'waiting_assets' | 'needs_human' | 'succeeded' | 'failed' | 'cancelled';
export type JobEventType =
  | 'stage_started'
  | 'gate_passed'
  | 'gate_failed'
  | 'retry'
  | 'escalation'
  | 'checkpoint'
  | 'cost'
  | 'warning'
  | 'assistant_summary'
  | 'needs_human'
  | 'finished';

export interface JobRow {
  id: string;
  gameId: string;
  userId: string;
  kind: JobKind;
  status: JobStatus;
  stage: string | null;
  stages: Record<string, unknown>;
  input: Record<string, unknown>;
  baseVersionId: string | null;
  resultVersionId: string | null;
  policyVersion: number;
  budgetUsdCap: number;
  costUsd: number;
  providerCostUsd: number;
  turns: number;
  priority: number;
  workerId: string | null;
  attempts: number;
  error: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobEvent {
  jobId: string;
  seq: number;
  ts: string;
  stage: string | null;
  type: JobEventType;
  payload: Record<string, unknown>;
}

export interface VersionRow {
  id: string;
  gameId: string;
  number: number;
  kind: 'stage' | 'accepted' | 'published';
  stage: string | null;
  parentVersionId: string | null;
  jobId: string | null;
  sourcePath: string | null;
  bundlePath: string | null;
  manifest: Record<string, unknown> | null;
  design: Record<string, unknown>;
  gateResults: Record<string, unknown>;
  evidence: Record<string, unknown>;
  engineVersion: string | null;
  contentHash: string | null;
  costUsd: number;
  policyVersion: number | null;
  isHead: boolean;
  createdAt: string;
}

export type NewVersion = Omit<VersionRow, 'id' | 'number' | 'createdAt' | 'isHead'>;

/**
 * The only persistence surface workers use. Two implementations: Supabase (production)
 * and a JSON file store (local development, demos, tests without credentials).
 */
export interface Store {
  claimJob(workerId: string): Promise<JobRow | null>;
  getJob(jobId: string): Promise<JobRow | null>;
  enqueueJob(job: Pick<JobRow, 'gameId' | 'userId' | 'kind'> & Partial<Pick<JobRow, 'input' | 'priority' | 'policyVersion' | 'budgetUsdCap' | 'baseVersionId'>>): Promise<JobRow>;
  updateJob(jobId: string, patch: Partial<Omit<JobRow, 'id'>>): Promise<void>;
  appendEvent(jobId: string, type: JobEventType, payload?: Record<string, unknown>, stage?: string | null): Promise<JobEvent>;
  listEvents(jobId: string): Promise<JobEvent[]>;
  insertVersion(v: NewVersion): Promise<VersionRow>;
  acceptVersion(versionId: string): Promise<void>;
  insertTrajectory(t: Trajectory): Promise<void>;
  listTrajectories(jobId: string): Promise<Trajectory[]>;
  activePolicy(): Promise<ModelPolicy>;
  /** Upload a file (checkpoint tarball, report, screenshot) and return its storage path. */
  putObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string>;
}
