import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ModelPolicy, type Trajectory } from '@gg/schemas';
import type { JobEvent, JobEventType, JobRow, NewVersion, Store, VersionRow } from './types.js';

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
}
