import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@gg/db';
import { registerProvider } from '@gg/llm';
import { CreateRequest } from '@gg/schemas';
import { BASE_MANIFESTS, LANTERN } from '@gg/template-freeform/node';
import type * as FreeformNode from '@gg/template-freeform/node';
import { checkProofs, readGameFiles, readGameLevels } from '@gg/templates/node';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import { guessBase } from './freeform.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';

// No bot wins anything here alone: the base genre's solver and the explorer both come back without a run, stuck near
// the start. With hints, when the test says so, the explorer finds a run.
const mode = vi.hoisted(() => ({ hintsWin: false }));
vi.mock('@gg/template-freeform/node', async (importOriginal) => {
  const real = await importOriginal<typeof FreeformNode>();
  return {
    ...real,
    proveLevel: (level: { id: string }, index: number, inputs: { hints?: unknown }) =>
      mode.hintsWin && inputs.hints
        ? { proof: { version: 1, level: level.id, seed: index + 1, ticks: 60, by: 'explorer', script: [{ from: 0, to: 60, input: { right: true } }] }, tried: ['explorer with hints: wins in 60 ticks'] }
        : { proof: null, tried: ['base solver: no win', 'explorer: budget spent'], stuck: { progress: 0.1, score: 0, hud: {}, goalDistance: 30, at: { x: 2, y: 5 } } },
  };
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
    // It was given hints first (the floor's own walk, in the dry run); they found nothing, so none were kept.
    expect(out.summary).toContain(`hints for ${ids.join(', ')}: no win`);
    const hints = join(gameDir, 'content', 'hints');
    expect(existsSync(hints) ? readdirSync(hints) : []).toEqual([]);
  }, 120_000);

  it('is proven on hints written for it, which stay beside the run they found', async () => {
    mode.hintsWin = true;
    try {
      const request = CreateRequest.parse({ prompt: LANTERN.prompt, genre: 'freeform', scopeTier: LANTERN.gdd.scopeTier, dryRun: true, seed: 1 });
      registerProvider('fake', new FakeProvider({ genre: BASE_MANIFESTS[guessBase(request.prompt)], request }));
      const gameDir = mkdtempSync(join(tmpdir(), 'gg-levels-hinted-'));
      dirs.push(gameDir);
      for (const stage of ['gdd', 'systems', 'composition', 'sprites', 'scaffold', 'behaviour', 'levels']) {
        const out = await new WorkerRunner().run(ctxFor(gameDir, request, stage));
        expect(out.ok, `${stage}: ${out.summary}`).toBe(true);
        if (stage !== 'levels') continue;
        const ids = readGameLevels(gameDir).map((l) => l.level.id);
        expect(out.summary).toContain(`hints for ${ids.join(', ')}: won ${ids.join(', ')}`);
        expect(out.summary).not.toContain('waiting for a winning run');
        const files = readGameFiles(gameDir);
        expect(files.hints.map((h) => h.level)).toEqual(ids);
        expect(files.proofs.map((p) => [p.level, p.by])).toEqual(ids.map((id) => [id, 'explorer']));
        // Each is a walk the level's own floor takes: its places are open tiles, the goal last.
        for (const { level } of readGameLevels(gameDir)) {
          const h = files.hints.find((x) => x.level === level.id)!;
          expect(h.steps.at(-1)).toMatchObject({ kind: 'reach', x: level.goal.x, y: level.goal.y });
          for (const s of h.steps) if (s.kind === 'reach') expect(level.legend[level.rows[s.y]![s.x]!]).not.toBe('solid');
        }
      }
    } finally {
      mode.hintsWin = false;
    }
  }, 120_000);
});
