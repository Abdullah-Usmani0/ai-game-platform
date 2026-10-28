import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '@gg/db';
import { describe, expect, it } from 'vitest';
import { extractCandidates, promote, writeCandidates } from './index.js';

describe('playbook extraction', () => {
  it('pairs failed attempts with the pass that followed, reading the stored gate reports', async () => {
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'gg-pb-')));
    const game = await store.createGame({ ownerId: 'u', slug: 'g1', title: 'G1', genre: 'platformer' });
    const job = await store.enqueueJob({ gameId: game.id, userId: 'u', kind: 'create', input: {} });
    const fail = await store.putObject('trajectories', 'g/g1/j/j1/levels-1-gate.json', new TextEncoder().encode(JSON.stringify({ checks: [{ name: 'solver', passed: false, detail: 'level l02 not completed' }], summary: 'tried seeds 1-8' })), 'application/json');
    const pass = await store.putObject('trajectories', 'g/g1/j/j1/levels-2-gate.json', new TextEncoder().encode(JSON.stringify({ checks: [{ name: 'solver', passed: true }], summary: 'regenerated l02 with a shorter gap' })), 'application/json');
    const base = { jobId: job.id, stage: 'levels', sampleIdx: 0, runner: 'structured', provider: 'anthropic', promptHash: 'p', inputTokens: 1, cachedTokens: 0, outputTokens: 1, costUsd: 0.01, durationMs: 10, artifactPath: null, scrubbed: false } as const;
    await store.insertTrajectory({ ...base, attempt: 1, model: 'claude-haiku-5-5', passed: false, gateReportPath: fail, failureMode: 'semantic_invalid' });
    await store.insertTrajectory({ ...base, attempt: 2, model: 'claude-sonnet-5-5', passed: true, gateReportPath: pass, failureMode: null });
    await store.insertTrajectory({ ...base, stage: 'gdd', attempt: 1, model: 'claude-haiku-5-5', passed: true, gateReportPath: null, failureMode: null });
    const candidates = await extractCandidates(store);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ genre: 'platformer', stage: 'levels', passedAttempt: { attempt: 2, model: 'claude-sonnet-5-5', summary: 'regenerated l02 with a shorter gap' } });
    expect(candidates[0]!.failedAttempts[0]!.failing).toEqual([{ name: 'solver', detail: 'level l02 not completed' }]);
    const harness = mkdtempSync(join(tmpdir(), 'gg-harness-'));
    const file = writeCandidates(harness, candidates);
    expect(JSON.parse(readFileSync(file, 'utf8')).candidates).toHaveLength(1);
    const entries = promote(harness, 'platformer', 'Shorter gaps when the solver fails a mid level.', `${job.id}/levels`);
    promote(harness, 'platformer', 'Shorter gaps when the solver fails a mid level.', `${job.id}/levels`);
    expect(readFileSync(entries, 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
  });
});
