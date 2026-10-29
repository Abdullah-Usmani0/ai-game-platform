import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@gg/db';
import { registerProvider, type Provider, type StructuredRequest, type StructuredResponse, type TextRequest, type TextResponse } from '@gg/llm';
import { GddFrontmatter, type CreateRequest, type LevelJson } from '@gg/schemas';
import { defaultSystems } from '@gg/scaffold';
import { createSim, DEFAULT_SEED, levelSeed } from '@gg/sdk';
import { levelPlan, runBot, simOptionsFor } from '@gg/template-core';
import { genre } from '@gg/templates/node';
import { parseFrontmatter } from '@gg/validators';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import { draftBody, draftFrontmatter, renderGdd } from './gdd-draft.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A game directory with the drafted GDD and default systems for a request, as the stages before levels leave it. */
function gameFor(req: CreateRequest): { gameDir: string; ctx: StageContext } {
  const g = genre(req.genre);
  const gameDir = mkdtempSync(join(tmpdir(), 'gg-levels-stage-'));
  dirs.push(gameDir);
  mkdirSync(join(gameDir, 'design'), { recursive: true });
  const fm = draftFrontmatter(req, g);
  writeFileSync(join(gameDir, 'design', 'gdd.md'), renderGdd(fm, draftBody(req, g, fm)));
  writeFileSync(join(gameDir, 'design', 'systems.json'), JSON.stringify(defaultSystems(g.id, g.optionalSystems)));
  const ctx: StageContext = {
    jobId: 'j1',
    gameId: 'g1',
    spec: { stage: 'levels', gate: [] },
    attempt: 1,
    workDir: join(gameDir, '..'),
    gameDir,
    policy: null,
    model: 'none',
    provider: 'none',
    store: {} as Store,
    log: () => {},
    dryRun: true,
    request: req,
    route: null,
    edit: null,
    versionId: 'v1',
  };
  return { gameDir, ctx };
}

const levelsOf = (gameDir: string): LevelJson[] =>
  readdirSync(join(gameDir, 'content', 'levels'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(gameDir, 'content', 'levels', f), 'utf8')) as LevelJson);

describe('levels stage', () => {
  it('builds the planned levels: the ramp, the boss on the last floor, each proven at the seed it is played with', async () => {
    const req: CreateRequest = { prompt: 'A dungeon of three floors and a warden at the bottom.', genre: 'topdown-action', scopeTier: 'medium', referenceTitles: [], dryRun: true, seed: 1 };
    const { gameDir, ctx } = gameFor(req);
    const out = await new WorkerRunner().run(ctx);
    expect(out.ok, out.summary).toBe(true);
    const g = genre('topdown-action');
    const fm = draftFrontmatter(req, g);
    const plan = levelPlan(g.levelGrammar.kind, { levels: fm.scope.levels, bosses: fm.scope.bosses, tier: fm.scopeTier });
    expect(fm.scope.bosses).toBe(1);
    const levels = levelsOf(gameDir);
    expect(levels.map((l) => l.id)).toEqual(plan.map((p) => p.id));
    expect(levels.map((l) => l.ramp?.difficulty)).toEqual(plan.map((p) => p.difficulty));
    // Only the last floor has the warden.
    expect(levels.map((l) => l.entities.some((e) => e.type === 'warden'))).toEqual(plan.map((p) => p.boss === 1));
    const options = simOptionsFor(g, defaultSystems(g.id, g.optionalSystems), { behaviours: g.defaultBehaviours });
    for (const [i, level] of levels.entries()) {
      expect(runBot(createSim({ ...options, level, seed: levelSeed(DEFAULT_SEED, i) }), g.bots[g.solverBot]!, 90 * 60).completed, level.id).toBe(true);
    }
  });

  it('builds one arena, whatever the tier', async () => {
    const req: CreateRequest = { prompt: 'Hold the campfire against the wolves for a minute.', genre: 'survivors', scopeTier: 'large', referenceTitles: [], dryRun: true, seed: 1 };
    const { gameDir, ctx } = gameFor(req);
    const out = await new WorkerRunner().run(ctx);
    expect(out.ok, out.summary).toBe(true);
    expect(levelsOf(gameDir).map((l) => l.id)).toEqual(['arena']);
    expect(draftFrontmatter(req, genre('survivors')).scope.levels).toBe(1);
  });
});

describe('gdd stage checks', () => {
  /** A provider that answers like the dry run, with its GDD front matter changed by `edit`. */
  const editing = (name: string, req: CreateRequest, edit: (fm: GddFrontmatter) => GddFrontmatter): Provider => {
    const inner = new FakeProvider({ genre: genre(req.genre), request: req });
    const p: Provider = {
      name,
      async structured(r: StructuredRequest): Promise<StructuredResponse> {
        const res = await inner.structured(r);
        return r.schemaName === 'GddFrontmatter' ? { ...res, data: edit(res.data as GddFrontmatter) } : res;
      },
      text: (r: TextRequest): Promise<TextResponse> => inner.text(r),
    };
    registerProvider(name, p);
    return p;
  };
  const runGdd = async (req: CreateRequest, provider: string) => {
    const { gameDir, ctx } = gameFor(req);
    rmSync(join(gameDir, 'design', 'gdd.md'));
    const out = await new WorkerRunner().run({ ...ctx, spec: { stage: 'gdd', gate: [] }, provider, model: 'scripted-1', dryRun: false });
    expect(out.ok, out.summary).toBe(true);
    expect(existsSync(join(gameDir, 'design', 'gdd.md'))).toBe(true);
    return { summary: out.summary, fm: GddFrontmatter.parse(parseFrontmatter(readFileSync(join(gameDir, 'design', 'gdd.md'), 'utf8'))!.data) };
  };

  it('never promises more arenas than an arena genre builds: a model answer with three is rejected for the draft', async () => {
    const req: CreateRequest = { prompt: 'Three nights of wolves around a campfire, one arena each.', genre: 'survivors', scopeTier: 'large', referenceTitles: [], dryRun: false, seed: 1 };
    editing('overpromise', req, (fm) => ({ ...fm, scope: { ...fm.scope, levels: 3 } }));
    const { summary, fm } = await runGdd(req, 'overpromise');
    expect(summary).toMatch(/samples rejected \(scope\.levels 3 exceeds the tier budget 1\)/);
    expect(fm.scope.levels).toBe(1);
  });

  it('rejects a feedback table that binds sound to an event with none', async () => {
    const req: CreateRequest = { prompt: 'A cave run by lantern light with beetles to stomp.', genre: 'platformer', scopeTier: 'small', referenceTitles: [], dryRun: false, seed: 1 };
    editing('silent', req, (fm) => ({ ...fm, feedbackEvents: [...fm.feedbackEvents, { event: 'spawn', channels: ['sfx'] }] }));
    const { summary, fm } = await runGdd(req, 'silent');
    expect(summary).toMatch(/samples rejected \('spawn' is bound to sfx but no sound plays for it/);
    expect(fm.feedbackEvents.some((f) => f.event === 'spawn')).toBe(false);
  });
});
