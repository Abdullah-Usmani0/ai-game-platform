import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ModelPolicy, type Trajectory } from '@gg/schemas';
import type { GameRow, JobEvent, JobEventType, JobRow, LineageRow, NewGame, NewVersion, Store, VersionRow } from './types';

interface FileState {
  games: GameRow[];
  lineage: LineageRow[];
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

/**
 * JSON-file store for local development, demos and evals. Not for production: every method re-reads the
 * file when it changed on disk and writes atomically, which is enough for one worker plus the dev web app.
 */
export class FileStore implements Store {
  private state: FileState;
  private readonly file: string;
  private mtime = 0;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'store.json');
    this.state = { games: [], lineage: [], jobs: [], events: [], versions: [], trajectories: [], policies: [DEFAULT_POLICY] };
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    const m = statSync(this.file).mtimeMs;
    if (m === this.mtime) return;
    const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<FileState>;
    this.state = {
      games: parsed.games ?? [],
      lineage: parsed.lineage ?? [],
      jobs: parsed.jobs ?? [],
      events: parsed.events ?? [],
      versions: parsed.versions ?? [],
      trajectories: parsed.trajectories ?? [],
      policies: parsed.policies?.length ? parsed.policies : [DEFAULT_POLICY],
    };
    this.mtime = m;
  }

  private save(): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
    this.mtime = statSync(this.file).mtimeMs;
  }

  async claimJob(workerId: string): Promise<JobRow | null> {
    this.load();
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
    this.load();
    const j = this.state.jobs.find((x) => x.id === jobId);
    return j ? { ...j } : null;
  }

  async enqueueJob(input: Parameters<Store['enqueueJob']>[0]): Promise<JobRow> {
    this.load();
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
    this.load();
    const j = this.state.jobs.find((x) => x.id === jobId);
    if (!j) throw new Error(`job ${jobId} not found`);
    Object.assign(j, patch);
    this.save();
  }

  async appendEvent(jobId: string, type: JobEventType, payload: Record<string, unknown> = {}, stage: string | null = null): Promise<JobEvent> {
    this.load();
    const seq = this.state.events.filter((e) => e.jobId === jobId).length + 1;
    const ev: JobEvent = { jobId, seq, ts: new Date().toISOString(), stage, type, payload };
    this.state.events.push(ev);
    this.save();
    return ev;
  }

  async listEvents(jobId: string): Promise<JobEvent[]> {
    this.load();
    return this.state.events.filter((e) => e.jobId === jobId).map((e) => ({ ...e }));
  }

  async insertVersion(v: NewVersion): Promise<VersionRow> {
    this.load();
    const number = this.state.versions.filter((x) => x.gameId === v.gameId).length + 1;
    const row: VersionRow = { ...v, id: v.id ?? randomUUID(), number, isHead: false, createdAt: new Date().toISOString() };
    this.state.versions.push(row);
    this.save();
    return { ...row };
  }

  async acceptVersion(versionId: string): Promise<void> {
    this.load();
    const v = this.state.versions.find((x) => x.id === versionId);
    if (!v) throw new Error(`version ${versionId} not found`);
    for (const x of this.state.versions) if (x.gameId === v.gameId) x.isHead = false;
    v.isHead = true;
    v.kind = 'accepted';
    const g = this.state.games.find((x) => x.id === v.gameId);
    if (g) {
      g.headVersionId = v.id;
      g.state = 'playable';
      g.updatedAt = new Date().toISOString();
    }
    this.save();
  }

  async insertTrajectory(t: Trajectory): Promise<void> {
    this.load();
    this.state.trajectories.push(t);
    this.save();
  }

  async listTrajectories(jobId: string): Promise<Trajectory[]> {
    this.load();
    return this.state.trajectories.filter((t) => t.jobId === jobId);
  }

  async activePolicy(): Promise<ModelPolicy> {
    this.load();
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

  async getObject(bucket: string, path: string): Promise<Uint8Array> {
    return new Uint8Array(readFileSync(join(this.dir, 'buckets', bucket, path)));
  }

  /** Absolute path of a stored object (the dev web app serves bundles straight from here). */
  objectPath(bucket: string, path: string): string {
    return join(this.dir, 'buckets', bucket, path);
  }

  async createGame(g: NewGame): Promise<GameRow> {
    this.load();
    if (this.state.games.some((x) => x.slug === g.slug)) throw new Error(`slug '${g.slug}' is taken`);
    const now = new Date().toISOString();
    const row: GameRow = {
      id: g.id ?? randomUUID(),
      ownerId: g.ownerId,
      slug: g.slug,
      title: g.title,
      genre: g.genre,
      visibility: g.visibility ?? 'private',
      state: g.state ?? 'draft',
      headVersionId: null,
      conceptMd: g.conceptMd ?? null,
      concept: g.concept ?? null,
      listing: g.listing ?? {},
      originVersionId: null,
      rootGameId: null,
      remixDepth: 0,
      stats: {},
      createdAt: now,
      updatedAt: now,
    };
    this.state.games.push(row);
    this.save();
    return { ...row };
  }

  async getGame(gameId: string): Promise<GameRow | null> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    return g ? { ...g } : null;
  }

  async getGameBySlug(slug: string): Promise<GameRow | null> {
    this.load();
    const g = this.state.games.find((x) => x.slug === slug);
    return g ? { ...g } : null;
  }

  async listGames(opts: { ownerId?: string; limit?: number } = {}): Promise<GameRow[]> {
    this.load();
    return this.state.games
      .filter((g) => !opts.ownerId || g.ownerId === opts.ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, opts.limit ?? 50)
      .map((g) => ({ ...g }));
  }

  async updateGame(gameId: string, patch: Partial<Omit<GameRow, 'id'>>): Promise<void> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g) throw new Error(`game ${gameId} not found`);
    Object.assign(g, patch, { updatedAt: new Date().toISOString() });
    this.save();
  }

  async getVersion(versionId: string): Promise<VersionRow | null> {
    this.load();
    const v = this.state.versions.find((x) => x.id === versionId);
    return v ? { ...v } : null;
  }

  async listVersions(gameId: string): Promise<VersionRow[]> {
    this.load();
    return this.state.versions.filter((v) => v.gameId === gameId).map((v) => ({ ...v }));
  }

  async listJobs(gameId: string): Promise<JobRow[]> {
    this.load();
    return this.state.jobs.filter((j) => j.gameId === gameId).map((j) => ({ ...j }));
  }

  async forkGame(originVersionId: string, opts: { ownerId: string; slug: string; title: string }): Promise<GameRow> {
    this.load();
    const origin = this.state.versions.find((v) => v.id === originVersionId);
    if (!origin) throw new Error(`origin version ${originVersionId} not found`);
    const src = this.state.games.find((g) => g.id === origin.gameId);
    if (!src) throw new Error(`origin game ${origin.gameId} not found`);
    const game = await this.createGame({ ownerId: opts.ownerId, slug: opts.slug, title: opts.title, genre: src.genre, conceptMd: src.conceptMd ?? undefined, concept: src.concept ?? undefined, state: 'draft' });
    this.load();
    const row = this.state.games.find((g) => g.id === game.id)!;
    row.originVersionId = origin.id;
    row.rootGameId = src.rootGameId ?? src.id;
    row.remixDepth = src.remixDepth + 1;
    for (const l of this.state.lineage.filter((l) => l.gameId === src.id)) this.state.lineage.push({ gameId: game.id, ancestorGameId: l.ancestorGameId, depth: l.depth + 1, forkedFromVersionId: origin.id });
    this.state.lineage.push({ gameId: game.id, ancestorGameId: src.id, depth: 1, forkedFromVersionId: origin.id });
    this.save();
    const copy = await this.insertVersion({ gameId: game.id, kind: 'accepted', stage: 'remix', parentVersionId: origin.id, jobId: null, sourcePath: origin.sourcePath, bundlePath: origin.bundlePath, manifest: origin.manifest, design: origin.design, gateResults: origin.gateResults, evidence: { ...origin.evidence, remixedFrom: origin.id }, engineVersion: origin.engineVersion, contentHash: origin.contentHash, costUsd: 0, policyVersion: origin.policyVersion });
    await this.acceptVersion(copy.id);
    return (await this.getGame(game.id))!;
  }

  async listLineage(gameId: string): Promise<LineageRow[]> {
    this.load();
    return this.state.lineage.filter((l) => l.gameId === gameId).map((l) => ({ ...l }));
  }
}
