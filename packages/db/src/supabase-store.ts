import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ModelPolicy, type Trajectory } from '@gg/schemas';
import type { GameRow, JobEvent, JobEventType, JobRow, LineageRow, NewGame, NewVersion, Store, VersionRow } from './types';

function snake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] = v;
  return out;
}

function camel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  return out as T;
}

/** Production store over Supabase with the service-role key (workers only; never ship this key to a browser). */
export class SupabaseStore implements Store {
  readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseStore {
    const url = env['SUPABASE_URL'];
    const key = env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    return new SupabaseStore(url, key);
  }

  private unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    if (res.data === null) throw new Error(`${what}: no data`);
    return res.data;
  }

  async claimJob(workerId: string): Promise<JobRow | null> {
    const res = await this.client.rpc('claim_job', { p_worker_id: workerId });
    if (res.error) throw new Error(`claim_job: ${res.error.message}`);
    const row = res.data as Record<string, unknown> | null;
    return row && row['id'] ? camel<JobRow>(row) : null;
  }

  async getJob(jobId: string): Promise<JobRow | null> {
    const res = await this.client.from('generation_jobs').select('*').eq('id', jobId).maybeSingle();
    if (res.error) throw new Error(`getJob: ${res.error.message}`);
    return res.data ? camel<JobRow>(res.data as Record<string, unknown>) : null;
  }

  async enqueueJob(input: Parameters<Store['enqueueJob']>[0]): Promise<JobRow> {
    const res = await this.client.from('generation_jobs').insert(snake({ ...input })).select('*').single();
    return camel<JobRow>(this.unwrap(res, 'enqueueJob') as Record<string, unknown>);
  }

  async updateJob(jobId: string, patch: Partial<Omit<JobRow, 'id'>>): Promise<void> {
    const res = await this.client.from('generation_jobs').update(snake(patch)).eq('id', jobId);
    if (res.error) throw new Error(`updateJob: ${res.error.message}`);
  }

  async appendEvent(jobId: string, type: JobEventType, payload: Record<string, unknown> = {}, stage: string | null = null): Promise<JobEvent> {
    const count = await this.client.from('job_events').select('seq', { count: 'exact', head: true }).eq('job_id', jobId);
    const seq = (count.count ?? 0) + 1;
    const res = await this.client.from('job_events').insert({ job_id: jobId, seq, stage, type, payload }).select('*').single();
    return camel<JobEvent>(this.unwrap(res, 'appendEvent') as Record<string, unknown>);
  }

  async listEvents(jobId: string): Promise<JobEvent[]> {
    const res = await this.client.from('job_events').select('*').eq('job_id', jobId).order('seq');
    return (this.unwrap(res, 'listEvents') as Record<string, unknown>[]).map((r) => camel<JobEvent>(r));
  }

  async insertVersion(v: NewVersion): Promise<VersionRow> {
    const count = await this.client.from('game_versions').select('id', { count: 'exact', head: true }).eq('game_id', v.gameId);
    const number = (count.count ?? 0) + 1;
    const res = await this.client.from('game_versions').insert(snake({ ...v, number })).select('*').single();
    return camel<VersionRow>(this.unwrap(res, 'insertVersion') as Record<string, unknown>);
  }

  async acceptVersion(versionId: string): Promise<void> {
    const res = await this.client.rpc('accept_version', { p_version_id: versionId });
    if (res.error) throw new Error(`accept_version: ${res.error.message}`);
  }

  async insertTrajectory(t: Trajectory): Promise<void> {
    const res = await this.client.from('trajectories').insert(snake({ ...t }));
    if (res.error) throw new Error(`insertTrajectory: ${res.error.message}`);
  }

  async listTrajectories(jobId: string): Promise<Trajectory[]> {
    const res = await this.client.from('trajectories').select('*').eq('job_id', jobId).order('created_at');
    return (this.unwrap(res, 'listTrajectories') as Record<string, unknown>[]).map((r) => camel<Trajectory>(r));
  }

  async activePolicy(): Promise<ModelPolicy> {
    const res = await this.client.from('model_policies').select('*').eq('active', true).single();
    const row = this.unwrap(res, 'activePolicy') as Record<string, unknown>;
    return ModelPolicy.parse({ version: row['version'], name: row['name'], stages: row['stages'], jobCaps: row['job_caps'] });
  }

  async putObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const res = await this.client.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
    if (res.error) throw new Error(`putObject ${bucket}/${path}: ${res.error.message}`);
    return `${bucket}/${path}`;
  }

  async getObject(bucket: string, path: string): Promise<Uint8Array> {
    const res = await this.client.storage.from(bucket).download(path);
    if (res.error || !res.data) throw new Error(`getObject ${bucket}/${path}: ${res.error?.message ?? 'no data'}`);
    return new Uint8Array(await res.data.arrayBuffer());
  }

  async createGame(g: NewGame): Promise<GameRow> {
    const res = await this.client.from('games').insert(snake({ ...g })).select('*').single();
    return camel<GameRow>(this.unwrap(res, 'createGame') as Record<string, unknown>);
  }

  async getGame(gameId: string): Promise<GameRow | null> {
    const res = await this.client.from('games').select('*').eq('id', gameId).maybeSingle();
    if (res.error) throw new Error(`getGame: ${res.error.message}`);
    return res.data ? camel<GameRow>(res.data as Record<string, unknown>) : null;
  }

  async getGameBySlug(slug: string): Promise<GameRow | null> {
    const res = await this.client.from('games').select('*').eq('slug', slug).maybeSingle();
    if (res.error) throw new Error(`getGameBySlug: ${res.error.message}`);
    return res.data ? camel<GameRow>(res.data as Record<string, unknown>) : null;
  }

  async listGames(opts: { ownerId?: string; limit?: number } = {}): Promise<GameRow[]> {
    let q = this.client.from('games').select('*').order('updated_at', { ascending: false }).limit(opts.limit ?? 50);
    if (opts.ownerId) q = q.eq('owner_id', opts.ownerId);
    const res = await q;
    return (this.unwrap(res, 'listGames') as Record<string, unknown>[]).map((r) => camel<GameRow>(r));
  }

  async updateGame(gameId: string, patch: Partial<Omit<GameRow, 'id'>>): Promise<void> {
    const res = await this.client.from('games').update(snake({ ...patch, updatedAt: new Date().toISOString() })).eq('id', gameId);
    if (res.error) throw new Error(`updateGame: ${res.error.message}`);
  }

  async getVersion(versionId: string): Promise<VersionRow | null> {
    const res = await this.client.from('game_versions').select('*').eq('id', versionId).maybeSingle();
    if (res.error) throw new Error(`getVersion: ${res.error.message}`);
    return res.data ? camel<VersionRow>(res.data as Record<string, unknown>) : null;
  }

  async listVersions(gameId: string): Promise<VersionRow[]> {
    const res = await this.client.from('game_versions').select('*').eq('game_id', gameId).order('number');
    return (this.unwrap(res, 'listVersions') as Record<string, unknown>[]).map((r) => camel<VersionRow>(r));
  }

  async listJobs(gameId: string): Promise<JobRow[]> {
    const res = await this.client.from('generation_jobs').select('*').eq('game_id', gameId).order('created_at');
    return (this.unwrap(res, 'listJobs') as Record<string, unknown>[]).map((r) => camel<JobRow>(r));
  }

  async forkGame(originVersionId: string, opts: { ownerId: string; slug: string; title: string }): Promise<GameRow> {
    const origin = await this.getVersion(originVersionId);
    if (!origin) throw new Error(`origin version ${originVersionId} not found`);
    const forked = await this.client.rpc('fork_game', { p_origin_version_id: originVersionId, p_new_owner: opts.ownerId, p_slug: opts.slug, p_title: opts.title });
    if (forked.error) throw new Error(`fork_game: ${forked.error.message}`);
    const game = camel<GameRow>(forked.data as Record<string, unknown>);
    const copy = await this.insertVersion({ gameId: game.id, kind: 'accepted', stage: 'remix', parentVersionId: origin.id, jobId: null, sourcePath: origin.sourcePath, bundlePath: origin.bundlePath, manifest: origin.manifest, design: origin.design, gateResults: origin.gateResults, evidence: { ...origin.evidence, remixedFrom: origin.id }, engineVersion: origin.engineVersion, contentHash: origin.contentHash, costUsd: 0, policyVersion: origin.policyVersion });
    await this.acceptVersion(copy.id);
    return (await this.getGame(game.id)) ?? game;
  }

  async listLineage(gameId: string): Promise<LineageRow[]> {
    const res = await this.client.from('remix_lineage').select('*').eq('game_id', gameId).order('depth');
    return (this.unwrap(res, 'listLineage') as Record<string, unknown>[]).map((r) => camel<LineageRow>(r));
  }
}
