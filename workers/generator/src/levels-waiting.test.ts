import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@gg/db';
import { registerProvider } from '@gg/llm';
import { CreateRequest } from '@gg/schemas';
import { BASE_MANIFESTS, LANTERN } from '@gg/template-freeform/node';
import type * as FreeformNode from '@gg/template-freeform/node';
import { checkProofs, readGameLevels } from '@gg/templates/node';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import { guessBase } from './freeform.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';

// No bot wins anything here: the base genre's solver and the explorer both come back without a run.
vi.mock('@gg/template-freeform/node', async (importOriginal) => {
  const real = await importOriginal<typeof FreeformNode>();
  return { ...real, proveLevel: () => ({ proof: null, tried: ['base solver: no win', 'explorer: budget spent'] }) };
});

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const ctxFor = (gameDir: string, request: CreateRequest, stage: string): StageContext => ({
  jobId: 'j1',
  gameId: 'g1',
  spec: { stage, gate: [] },
  attempt: 1,
  workDir: join(gameDir, '..'),
  gameDir,
  policy: null,
  model: 'fake',
  provider: 'fake',
  store: {} as Store,
  log: () => {},
  dryRun: true,
  request,
  route: null,
  edit: null,
  versionId: 'v1',
});

describe('a freeform level no bot can win', () => {
  it('ships without a run and waits for a player: the levels stage says which, the prove check only warns', async () => {
    const request = CreateRequest.parse({ prompt: LANTERN.prompt, genre: 'freeform', scopeTier: LANTERN.gdd.scopeTier, dryRun: true, seed: 1 });
    registerProvider('fake', new FakeProvider({ genre: BASE_MANIFESTS[guessBase(request.prompt)], request }));
    const gameDir = mkdtempSync(join(tmpdir(), 'gg-levels-waiting-'));
    dirs.push(gameDir);
    for (const stage of ['gdd', 'systems', 'composition', 'sprites', 'scaffold', 'behaviour']) {
      const out = await new WorkerRunner().run(ctxFor(gameDir, request, stage));
      expect(out.ok, `${stage}: ${out.summary}`).toBe(true);
    }
    const out = await new WorkerRunner().run(ctxFor(gameDir, request, 'levels'));
    expect(out.ok, out.summary).toBe(true);
    const ids = readGameLevels(gameDir).map((l) => l.level.id);
    expect(ids).toHaveLength(LANTERN.gdd.scope.levels);
    expect(out.summary).toContain(`; waiting for a winning run: ${ids.join(', ')} (the game is not listed until a player records one)`);
    const proofs = join(gameDir, 'content', 'proofs');
    expect(existsSync(proofs) ? readdirSync(proofs) : []).toEqual([]);
    const check = checkProofs(gameDir);
    expect(check.ok).toBe(true);
    expect(check.issues.map((i) => [i.code, i.severity, i.at?.path])).toEqual(ids.map((id) => ['no_proof', 'warning', id]));
    expect(check.metrics).toMatchObject({ proven: 0, unproven: ids.length });
  }, 120_000);
});
