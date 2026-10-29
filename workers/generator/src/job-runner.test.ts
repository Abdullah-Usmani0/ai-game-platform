import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore } from '@gg/db';
import { afterAll, describe, expect, it } from 'vitest';
import { runJob } from './job-runner.js';

const harness = resolve(fileURLToPath(new URL('../../../harness', import.meta.url)));
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tempDir = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};

describe('runJob setup', () => {
  it('fails a create job for a genre without a template at setup, with the reason, instead of crashing', async () => {
    const store = new FileStore(tempDir('gg-job-runner-store-'));
    const game = await store.createGame({ ownerId: 'maker', slug: 'cards', title: 'Cards', genre: 'deckbuilder' });
    await store.enqueueJob({ gameId: game.id, userId: 'maker', kind: 'create', input: { prompt: 'A deckbuilder about a travelling circus and its cards.', genre: 'deckbuilder', dryRun: true } });
    const job = (await store.claimJob('test'))!;
    const status = await runJob({ store, job, templateDir: harness, workRoot: tempDir('gg-job-runner-work-'), workerId: 'test', policy: null });
    expect(status).toBe('failed');
    const after = await store.getJob(job.id);
    expect(after?.status).toBe('failed');
    expect(after?.error).toMatchObject({ stage: 'setup' });
    expect(String((after?.error as { reason?: string }).reason)).toMatch(/^invalid create request: genre: /);
    expect((await store.listEvents(job.id)).at(-1)).toMatchObject({ type: 'finished', payload: { status: 'failed', stage: 'setup' } });
  });
});
