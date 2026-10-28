import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ModelPolicy, type Trajectory } from '@gg/schemas';
import type { JobEvent, JobEventType, JobRow, NewVersion, Store, VersionRow } from './types.js';

interface FileState {
  jobs: JobRow[];
  events: JobEvent[];
  versions: VersionRow[];
  trajectories: Trajectory[];
  policies: ModelPolicy[];
}

const DEFAULT_POLICY: ModelPolicy = ModelPolicy.parse({
  version: 1,
  name: 'local-dev',
  stages: {
    implement: { runner: 'claude-sdk', provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'medium', k: 1, repairRounds: 2, caps: { turns: 120, usd: 4, wallMin: 30 } },
    levels: { runner: 'claude-sdk', provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', k: 1, repairRounds: 2, caps: { turns: 60, usd: 1, wallMin: 15 } },
    behaviour: { runner: 'structured', provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'medium', k: 4, repairRounds: 2, caps: { turns: 0, usd: 0.5, wallMin: 5 } },
  },
  jobCaps: { softUsd: 10, hardUsd: 15, providerUsd: 3, wallMin: 90 },
});

/** JSON-file store for local development and the demo. Single-process; not for production. */
export class FileStore implements Store {
  private state: FileState;
  private readonly file: string;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'store.json');
    this.state = existsSync(this.file)
      ? (JSON.parse(readFileSync(this.file, 'utf8')) as FileState)
      : { jobs: [], events: [], versions: [], trajectories: [], policies: [DEFAULT_POLICY] };
  }

  private save(): void {
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  async claimJob(workerId: string): Promise<JobRow | null> {
    const job = this.state.jobs.filter((j) => j.status === 'queued').sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];
    if (!job) return null;
    job.status = 'running';
    job.workerId = workerId;
    job.startedAt = new Date().toISOString();
    job.attempts++;
    this.save();
    return { ...job };
  }

  async getJob(jobId: string): Promise<JobRow | null> {
    const j = this.state.jobs.find((x) => x.id === jobId);
    return j ? { ...j } : null;
  }

  async enqueueJob(input: Parameters<Store['enqueueJob']>[0]): Promise<JobRow> {
    const job: JobRow = {
      id: randomUUID(),
      gameId: input.gameId,
      userId: input.userId,
      kind: input.kind,
      status: 'queued',
      stage: null,
      stages: {},
      input: input.input ?? {},
      baseVersionId: input.baseVersionId ?? null,
      resultVersionId: null,
      policyVersion: input.policyVersion ?? 1,
      budgetUsdCap: input.budgetUsdCap ?? 15,
      costUsd: 0,
      providerCostUsd: 0,
      turns: 0,
      priority: input.priority ?? 0,
      workerId: null,
      attempts: 0,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    };
    this.state.jobs.push(job);
    this.save();
    return { ...job };
  }

  async updateJob(jobId: string, patch: Partial<Omit<JobRow, 'id'>>): Promise<void> {
    const j = this.state.jobs.find((x) => x.id === jobId);
    if (!j) throw new Error(`job ${jobId} not found`);
    Object.assign(j, patch);
    this.save();
  }

  async appendEvent(jobId: string, type: JobEventType, payload: Record<string, unknown> = {}, stage: string | null = null): Promise<JobEvent> {
    const seq = this.state.events.filter((e) => e.jobId === jobId).length + 1;
    const ev: JobEvent = { jobId, seq, ts: new Date().toISOString(), stage, type, payload };
    this.state.events.push(ev);
    this.save();
    return ev;
  }

  async listEvents(jobId: string): Promise<JobEvent[]> {
    return this.state.events.filter((e) => e.jobId === jobId).map((e) => ({ ...e }));
  }

  async insertVersion(v: NewVersion): Promise<VersionRow> {
    const number = this.state.versions.filter((x) => x.gameId === v.gameId).length + 1;
    const row: VersionRow = { ...v, id: randomUUID(), number, isHead: false, createdAt: new Date().toISOString() };
    this.state.versions.push(row);
    this.save();
    return { ...row };
  }

  async acceptVersion(versionId: string): Promise<void> {
    const v = this.state.versions.find((x) => x.id === versionId);
    if (!v) throw new Error(`version ${versionId} not found`);
    for (const x of this.state.versions) if (x.gameId === v.gameId) x.isHead = false;
    v.isHead = true;
    v.kind = 'accepted';
    this.save();
  }

  async insertTrajectory(t: Trajectory): Promise<void> {
    this.state.trajectories.push(t);
    this.save();
  }

  async listTrajectories(jobId: string): Promise<Trajectory[]> {
    return this.state.trajectories.filter((t) => t.jobId === jobId);
  }

  async activePolicy(): Promise<ModelPolicy> {
    const p = this.state.policies[this.state.policies.length - 1];
    if (!p) throw new Error('no policy');
    return p;
  }

  async putObject(bucket: string, path: string, bytes: Uint8Array, _contentType: string): Promise<string> {
    const full = join(this.dir, 'buckets', bucket, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
    return `${bucket}/${path}`;
  }
}
