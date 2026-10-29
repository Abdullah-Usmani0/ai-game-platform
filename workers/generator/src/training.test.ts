import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore, type JobRow, type Store } from '@gg/db';
import { promptHash, registerProvider, type Provider, type StructuredRequest, type StructuredResponse, type TextRequest, type TextResponse } from '@gg/llm';
import { CreateRequest } from '@gg/schemas';
import { DEFAULT_STYLE, defaultSystems } from '@gg/scaffold';
import { genre } from '@gg/templates/node';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import { draftBody, draftFrontmatter, renderGdd } from './gdd-draft.js';
import { runJob } from './job-runner.js';
import type { StageContext, StageSpec } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';
import { contributorsOf, recordPairs, type VerifiedPair } from './training.js';

const harness = resolve(fileURLToPath(new URL('../../../harness', import.meta.url)));
const g = genre('platformer');
const request = CreateRequest.parse({ prompt: 'A lantern-carrying mole dashes through crumbling tunnels and stomps beetles.', genre: 'platformer', scopeTier: 'small' });

/**
 * Answers like the dry run's fake provider (valid artifacts for the genre) but under another name, so the worker treats
 * them as model output. It records every prompt and can reject a schema's first answer to force a repair round.
 */
class ScriptedProvider implements Provider {
  readonly name = 'scripted';
  readonly prompts: Array<{ schema: string; prompt: string }> = [];
  readonly rejectFirst = new Set<string>();
  readonly alwaysReject = new Set<string>();
  failText = false;
  private readonly inner = new FakeProvider({ genre: g, request });

  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    this.prompts.push({ schema: req.schemaName, prompt: req.prompt });
    if (this.alwaysReject.has(req.schemaName) || this.rejectFirst.delete(req.schemaName)) return { data: { nonsense: true }, usage: { inputTokens: 10, outputTokens: 5 } };
    return this.inner.structured(req);
  }

  async text(req: TextRequest): Promise<TextResponse> {
    this.prompts.push({ schema: 'text', prompt: req.prompt });
    if (this.failText) throw new Error('text endpoint unavailable');
    return this.inner.text(req);
  }
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tempDir = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};

/** A game directory with the design files the systems and behaviour stages read. */
function designedGame(): string {
  const gameDir = tempDir('gg-training-game-');
  mkdirSync(join(gameDir, 'design'), { recursive: true });
  const fm = draftFrontmatter(request, g);
  writeFileSync(join(gameDir, 'design', 'gdd.md'), renderGdd(fm, draftBody(request, g, fm)));
  writeFileSync(join(gameDir, 'design', 'style.json'), JSON.stringify(DEFAULT_STYLE));
  writeFileSync(join(gameDir, 'design', 'systems.json'), JSON.stringify(defaultSystems('platformer', g.optionalSystems)));
  return gameDir;
}

function ctxFor(gameDir: string, stage: string, provider: string): StageContext {
  return {
    jobId: 'j1',
    gameId: 'g1',
    spec: { stage, gate: [] },
    attempt: 1,
    workDir: join(gameDir, '..'),
    gameDir,
    policy: null,
    model: 'scripted-1',
    provider,
    store: {} as Store,
    log: () => {},
    dryRun: false,
    request,
    route: null,
    edit: null,
    versionId: 'v1',
  };
}

describe('stage pairs', () => {
  const runner = new WorkerRunner();

  it('the design stages hand over what the model wrote, recorded against the first prompt even after a repair', async () => {
    const provider = new ScriptedProvider();
    provider.rejectFirst.add('GddFrontmatter');
    registerProvider('scripted-stages', provider);
    const gameDir = tempDir('gg-training-stages-');
    const gdd = await runner.run(ctxFor(gameDir, 'gdd', 'scripted-stages'));
    expect(gdd.ok).toBe(true);
    expect(gdd.pairs?.map((p) => p.artifact)).toEqual(['GddFrontmatter', 'GddBody']);
    const asked = provider.prompts.filter((p) => p.schema === 'GddFrontmatter');
    expect(asked).toHaveLength(2);
    expect(asked[1]!.prompt).toContain('previous attempt was rejected');
    expect(gdd.pairs![0]!.prompt).toBe(asked[0]!.prompt);
    expect(readFileSync(join(gameDir, 'design', 'gdd.md'), 'utf8')).toContain(gdd.pairs![1]!.output as string);

    const systems = await runner.run(ctxFor(gameDir, 'systems', 'scripted-stages'));
    expect(systems.pairs?.map((p) => p.artifact)).toEqual(['SystemsJson']);
    expect(systems.pairs![0]!.output).toEqual(JSON.parse(readFileSync(join(gameDir, 'design', 'systems.json'), 'utf8')));
    const behaviour = await runner.run(ctxFor(gameDir, 'behaviour', 'scripted-stages'));
    expect(behaviour.pairs!.length).toBeGreaterThan(0);
    expect(new Set(behaviour.pairs!.map((p) => p.artifact))).toEqual(new Set(['BehaviourFsm']));
  });

  it('a fallback (drafted body, default systems) is not model output and yields no pair', async () => {
    const provider = new ScriptedProvider();
    provider.failText = true;
    provider.alwaysReject.add('SystemsJson');
    registerProvider('scripted-fallback', provider);
    const gameDir = tempDir('gg-training-fallback-');
    const gdd = await runner.run(ctxFor(gameDir, 'gdd', 'scripted-fallback'));
    expect(gdd.pairs?.map((p) => p.artifact)).toEqual(['GddFrontmatter']);
    const systems = await runner.run(ctxFor(gameDir, 'systems', 'scripted-fallback'));
    expect(systems.ok).toBe(true);
    expect(systems.summary).toContain('genre defaults');
    expect(systems.pairs).toEqual([]);
  });
});

describe('recordPairs', () => {
  const pair = (over: Partial<VerifiedPair> = {}): VerifiedPair => ({ artifact: 'SystemsJson', system: 'sys', prompt: 'p1', output: { version: 1 }, stage: 'systems', model: 'claude-sonnet-5-5', provider: 'anthropic', verifiedBy: 'trajectories/g/x/j/y/systems-1-gate.json', ...over });

  async function remix(): Promise<{ store: FileStore; job: JobRow; game: Awaited<ReturnType<FileStore['forkGame']>> }> {
    const store = new FileStore(tempDir('gg-training-store-'));
    const origin = await store.createGame({ ownerId: 'origin-owner', slug: 'origin', title: 'Origin', genre: 'platformer' });
    const v = await store.insertVersion({ gameId: origin.id, kind: 'stage', stage: 'publish', parentVersionId: null, jobId: null, sourcePath: 'checkpoints/x.tgz', bundlePath: null, manifest: null, design: {}, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: null });
    await store.acceptVersion(v.id);
    const game = await store.forkGame(v.id, { ownerId: 'remixer', slug: 'copy', title: 'Copy' });
    const job = await store.enqueueJob({ gameId: game.id, userId: 'remixer', kind: 'edit_behaviour' });
    return { store, job, game };
  }

  it('names the requester, the owner and every remix ancestor, and records real model output only', async () => {
    const { store, job, game } = await remix();
    expect((await contributorsOf(store, job, game)).sort()).toEqual(['origin-owner', 'remixer']);
    const src = { store, job, game, genre: 'platformer', dryRun: false, policyVersion: 3 };
    expect(await recordPairs({ ...src, dryRun: true }, [pair()])).toEqual({ recorded: 0, skipped: 'dry run' });
    expect(await recordPairs(src, [pair({ provider: 'fake', model: 'fake' })])).toMatchObject({ recorded: 0 });
    expect(await recordPairs(src, [pair(), pair({ stage: 'route', artifact: 'EditRoute', prompt: 'p2' })])).toEqual({ recorded: 2 });
    const rows = await store.listTrainingPairs();
    expect(rows.map((r) => r.stage)).toEqual(['systems', 'route']);
    expect(rows[0]).toMatchObject({ genre: 'platformer', jobId: job.id, gameId: game.id, policyVersion: 3, input: { system: 'sys', prompt: 'p1' }, inputHash: promptHash('sys', 'p1', 'SystemsJson') });
    expect(rows[0]!.contributors.sort()).toEqual(['origin-owner', 'remixer']);
  });

  it('an ancestor opting out removes the remix pairs and stops new ones; a store failure never throws', async () => {
    const { store, job, game } = await remix();
    const src = { store, job, game, genre: 'platformer', dryRun: false, policyVersion: null };
    await recordPairs(src, [pair()]);
    await store.setTrainingOptOut('origin-owner', true);
    expect(await store.listTrainingPairs()).toEqual([]);
    expect(await recordPairs(src, [pair()])).toEqual({ recorded: 0, skipped: 'a contributor opted out of training' });
    const broken = Object.assign(Object.create(store) as FileStore, {
      trainingOptOut: async () => false,
      insertTrainingPair: async () => {
        throw new Error('disk full');
      },
    });
    expect(await recordPairs({ ...src, store: broken }, [pair()])).toEqual({ recorded: 0, skipped: 'store error: disk full' });
  });
});

describe('runJob records training pairs', () => {
  it('records the passed stages of a finished job, and nothing from a job that fails a later gate', async () => {
    const saved = process.env['GG_DRY_RUN'];
    delete process.env['GG_DRY_RUN'];
    try {
      registerProvider('scripted-job', new ScriptedProvider());
      const store = new FileStore(tempDir('gg-training-job-store-'));
      const workRoot = tempDir('gg-training-work-');
      const gameDir = designedGame();
      const game = await store.createGame({ ownerId: 'maker', slug: 'mole', title: 'Mole', genre: 'platformer' });
      const stages: StageSpec[] = [
        { stage: 'systems', runner: 'worker', provider: 'scripted-job', model: 'scripted-1', gate: ['validate:systems'] },
        { stage: 'behaviour', runner: 'worker', provider: 'scripted-job', model: 'scripted-1', gate: ['validate:behaviour'] },
      ];
      const run = async (plan: StageSpec[]) => {
        await store.enqueueJob({ gameId: game.id, userId: 'maker', kind: 'create', input: { gameSource: gameDir, stages: plan } });
        const job = (await store.claimJob('test'))!;
        return { status: await runJob({ store, job, templateDir: harness, workRoot, workerId: 'test', policy: null }), job };
      };
      const ok = await run(stages);
      expect(ok.status).toBe('succeeded');
      const pairs = await store.listTrainingPairs();
      expect(pairs.filter((p) => p.stage === 'systems')).toHaveLength(1);
      expect(pairs.filter((p) => p.stage === 'behaviour').length).toBe(pairs.length - 1);
      expect(pairs.length).toBeGreaterThan(1);
      const systemsPair = pairs.find((p) => p.stage === 'systems')!;
      expect(systemsPair).toMatchObject({ genre: 'platformer', model: 'scripted-1', provider: 'scripted-job', jobId: ok.job.id, contributors: ['maker'] });
      expect(systemsPair.verifiedBy).toMatch(/systems-1-gate\.json$/);
      expect((await store.listEvents(ok.job.id)).find((e) => e.type === 'finished')?.payload['trainingPairs']).toBe(pairs.length);

      // The same stages pass again, but a later gate never does: the job fails and records nothing.
      writeFileSync(join(gameDir, 'design', 'style.json'), JSON.stringify({ broken: true }));
      const failed = await run([...stages, { stage: 'smoke', runner: 'none', gate: ['validate:style'] }]);
      expect(failed.status).toBe('failed');
      expect((await store.getJob(failed.job.id))?.error).toMatchObject({ stage: 'smoke' });
      expect((await store.listTrajectories(failed.job.id)).filter((t) => t.passed).map((t) => t.stage)).toEqual(['systems', 'behaviour']);
      expect(await store.listTrainingPairs()).toHaveLength(pairs.length);
    } finally {
      if (saved !== undefined) process.env['GG_DRY_RUN'] = saved;
    }
  });
});
