import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileStore } from './file-store';

describe('FileStore', () => {
  it('enqueues, claims, logs events, versions and trajectories', async () => {
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'gg-store-')));
    const job = await store.enqueueJob({ gameId: 'g1', userId: 'u1', kind: 'create', input: { prompt: 'a cave platformer' } });
    expect(job.status).toBe('queued');
    const claimed = await store.claimJob('w1');
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe('running');
    expect(await store.claimJob('w2')).toBeNull();
    await store.appendEvent(job.id, 'stage_started', { stage: 'smoke' }, 'smoke');
    await store.appendEvent(job.id, 'gate_passed', {}, 'smoke');
    const events = await store.listEvents(job.id);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    const v = await store.insertVersion({ gameId: 'g1', kind: 'stage', stage: 'smoke', parentVersionId: null, jobId: job.id, sourcePath: 'checkpoints/x.tgz', bundlePath: null, manifest: null, design: {}, gateResults: {}, evidence: {}, engineVersion: 'e', contentHash: 'h', costUsd: 0, policyVersion: 1 });
    expect(v.number).toBe(1);
    await store.acceptVersion(v.id);
    await store.insertTrajectory({ jobId: job.id, stage: 'smoke', attempt: 1, sampleIdx: 0, runner: 'structured', provider: 'none', model: 'none', promptHash: 'p', inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 5, passed: true, gateReportPath: null, failureMode: null, artifactPath: null, scrubbed: false });
    expect((await store.listTrajectories(job.id)).length).toBe(1);
    expect((await store.activePolicy()).version).toBe(1);
    const path = await store.putObject('checkpoints', 'g1/j1/smoke.tgz', new Uint8Array([1, 2, 3]), 'application/gzip');
    expect(path).toBe('checkpoints/g1/j1/smoke.tgz');
  });
});
