import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore, waitingLevels, type Store } from '@gg/db';
import { registerProvider } from '@gg/llm';
import { ARTIFACT_SCHEMAS, CreateRequest, DialogueFile, FREEFORM_BASES, LevelJson, Objectives, peopleOn, SpriteSheet, type BehaviourFsm, type LevelHints } from '@gg/schemas';
import { BASE_MANIFESTS, EXAMPLES, exampleStory, freeformManifest, HEIST, LANTERN, type FreeformExample } from '@gg/template-freeform/node';
import { checkGameSprites, checkGameStory, checkProofs, readGameFiles, readGameLevels } from '@gg/templates/node';
import { validateBehaviour } from '@gg/validators';
import { afterAll, describe, expect, it } from 'vitest';
import { checkpoint } from './checkpoint.js';
import { FakeProvider } from './fake-provider.js';
import { baseSystems, defaultObjectives, draftFreeformFrontmatter, exampleFor, guessBase } from './freeform.js';
import { createPlan, editPlan } from './plan.js';
import { loadPresets } from './presets.js';
import { hintIssues, hintsFor, verifyFreeformGdd, verifyFreeformSystems } from './runners/freeform-stages.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';
import { restorePlayerRuns, verifyProof } from './verify-proof.js';

const harness = resolve(fileURLToPath(new URL('../../../harness', import.meta.url)));
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('hints a model writes for a level', () => {
  const rows = ['########', '#S....G#', '########', '########', '########', '########'];
  const level = LevelJson.parse({ version: 1, id: 'l01', name: 'L', tileSize: 8, width: 8, height: 6, legend: { '.': 'air', '#': 'solid', S: 'spawn', G: 'goal' }, rows, spawn: { x: 1, y: 1 }, goal: { x: 6, y: 1 } });
  const hints = (steps: LevelHints['steps']): LevelHints => ({ version: 1, level: 'l01', steps });

  it('are turned down when a place is off the level or inside a wall, or a HUD number is one the game does not keep', () => {
    expect(hintIssues(hints([{ kind: 'reach', x: 2, y: 1, r: 1 }, { kind: 'hud_at_least', key: 'coins', value: 3 }, { kind: 'hud_at_least', key: 'score', value: 50 }]), level, ['coins'])).toEqual([]);
    expect(hintIssues(hints([{ kind: 'reach', x: 2, y: 2, r: 1 }, { kind: 'reach', x: 9, y: 1, r: 1 }, { kind: 'hud_at_least', key: 'keys', value: 1 }]), level, ['coins'])).toEqual([
      'step 1: (2, 2) is inside a wall',
      'step 2: (9, 1) is off the 8 x 6 level',
      "step 3: the game keeps no HUD number 'keys' (it keeps coins, and the score)",
    ]);
    expect(hintIssues({ ...hints([{ kind: 'reach', x: 2, y: 1, r: 1 }]), level: 'l02' }, level, [])).toEqual(["level must be 'l01'"]);
  });

  it('stay with their level while they fit it: an edit that walls a step in drops them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gg-hints-'));
    try {
      mkdirSync(join(dir, 'content', 'hints'), { recursive: true });
      writeFileSync(join(dir, 'content', 'hints', 'l01.json'), JSON.stringify(hints([{ kind: 'reach', x: 3, y: 1, r: 1 }, { kind: 'hud_at_least', key: 'coins', value: 3 }])));
      expect(hintsFor(dir, level)?.steps).toHaveLength(2);
      expect(hintsFor(dir, { ...level, rows: ['########', '#S.#..G#', ...rows.slice(2)] })).toBeUndefined();
      expect(hintsFor(dir, { ...level, id: 'l02' })).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('freeform ideas', () => {
  it('build on the base their words point at, and on the example game there when it shares the most words', () => {
    for (const ex of EXAMPLES) {
      expect(guessBase(ex.prompt), ex.id).toBe(ex.systems.composition.base);
      expect(exampleFor(ex.systems.composition.base, ex.prompt), ex.id).toBe(ex);
    }
    expect(guessBase('Something nobody has a word for yet.')).toBe('topdown-action');
    expect(exampleFor('shmup', 'A starfighter pilot shooting lasers.')).toBeNull();
    // A rush of orders reads as an arena to keep up in, even a cosy one (a farm word); a lighthouse's cellar, a cliff path.
    const rush = 'A cosy tea-shop rush: hurry each order to its table before the customer leaves, and step around the spilled puddles.';
    expect(guessBase(rush)).toBe('survivors');
    expect(exampleFor('survivors', rush)?.id).toBe('tearoom');
    const night = 'A lighthouse keeper through a stormy night: carry oil up from the cellar to keep the lamp burning, leaping the gaps in the cliff path.';
    expect(guessBase(night)).toBe('platformer');
    expect(exampleFor('platformer', night)?.id).toBe('lighthouse');
  });

  it('the drafts on every base, in every tier, pass the checks a model answer must pass', () => {
    for (const base of FREEFORM_BASES) {
      for (const scopeTier of ['small', 'medium', 'large'] as const) {
        const req = CreateRequest.parse({ prompt: 'A cosy little test game about a brave teapot.', genre: 'freeform', scopeTier, dryRun: true });
        const fm = draftFreeformFrontmatter(req, base);
        expect(verifyFreeformGdd(fm, scopeTier), `${base}/${scopeTier}`).toEqual([]);
        expect(verifyFreeformSystems(baseSystems(base), fm), `${base}/${scopeTier}`).toEqual([]);
        expect(Objectives.safeParse(defaultObjectives(base, fm.targets.levelTimeS)).success, base).toBe(true);
      }
    }
  });

  it('the example games pass them too', () => {
    for (const ex of EXAMPLES) {
      expect(verifyFreeformGdd(ex.gdd, ex.gdd.scopeTier), ex.id).toEqual([]);
      expect(verifyFreeformSystems(ex.systems, ex.gdd), ex.id).toEqual([]);
    }
  });

  it('a composition that breaks the rules is turned down with the reason', () => {
    const twoMovers = { ...LANTERN.systems, systems: [...LANTERN.systems.systems, { id: 'movement-topdown', params: {} }] };
    expect(verifyFreeformSystems(twoMovers, LANTERN.gdd).join('; ')).toMatch(/movement-topdown does not work with platformer movement/);
    expect(verifyFreeformSystems({ ...LANTERN.systems, composition: { base: 'survivors' } }, LANTERN.gdd)).toContain("composition.base must be the GDD's base 'platformer'");
    const noWin = { ...LANTERN.systems, systems: LANTERN.systems.systems.filter((s) => s.id !== 'objectives') };
    expect(verifyFreeformSystems(noWin, LANTERN.gdd).length).toBeGreaterThan(0);
  });
});

describe('freeform plans', () => {
  it('a freeform game names its entities after its systems and proves its levels again after code changes; curated plans are as they were', () => {
    const presets = loadPresets(harness);
    const curated = createPlan(presets).map((s) => s.stage);
    const freeform = createPlan(presets, { freeform: true }).map((s) => s.stage);
    expect(curated).not.toContain('composition');
    expect(curated).not.toContain('prove');
    // Every game's cast gets its look once its entities are known: a curated game's after its systems, a freeform one's after its composition.
    expect(curated.slice(0, 4)).toEqual(['gdd', 'systems', 'sprites', 'scaffold']);
    expect(freeform.slice(0, 5)).toEqual(['gdd', 'systems', 'composition', 'sprites', 'scaffold']);
    expect(freeform[freeform.indexOf('implement') + 1]).toBe('prove');
    // A bot of the game's own once its levels are made (and proven again after its code changes), when levels wait.
    expect(freeform[freeform.indexOf('levels') + 1]).toBe('bot');
    expect(freeform.filter((s) => s !== 'composition' && s !== 'prove' && s !== 'bot')).toEqual(curated);
    expect(editPlan('code', presets, false, { freeform: true }).map((s) => s.stage).slice(0, 3)).toEqual(['implement', 'prove', 'bot']);
    expect(editPlan('content', presets, false, { freeform: true }).map((s) => s.stage).slice(0, 2)).toEqual(['levels', 'bot']);
    expect(editPlan('code', presets).map((s) => s.stage)).not.toContain('prove');
    expect(presets['bot']).toMatchObject({ when: 'levels_wait', skills: ['bot-author', 'verify'] });
    for (const s of freeform) expect(presets[s], s).toBeDefined();
  });
});

describe('the dry-run provider on a freeform idea', () => {
  const req = CreateRequest.parse({ prompt: LANTERN.prompt, genre: 'freeform', dryRun: true });
  const fake = new FakeProvider({ genre: BASE_MANIFESTS['platformer'], request: req });

  it('answers every freeform artifact with something schema-valid, from the example on the base', async () => {
    const answers: Record<string, unknown> = {};
    for (const [name, prompt] of [
      ['FreeformGddFrontmatter', 'Concept:\n...'],
      ['FreeformSystemsJson', 'GDD front matter: {}\n\nBase genre: platformer (platformer movement, tilemap levels).'],
      ['EntityRoster', 'Base genre: platformer. Systems: movement-platformer.'],
      ['Objectives', 'Base genre: platformer; its levels have a goal tile to reach. Level time: 45 s.'],
    ] as const) {
      const res = await fake.structured({ model: 'fake', system: '', prompt, schema: {}, schemaName: name });
      expect(ARTIFACT_SCHEMAS[name].safeParse(res.data).success, name).toBe(true);
      answers[name] = res.data;
    }
    expect(answers['FreeformGddFrontmatter']).toMatchObject({ genre: 'freeform', base: 'platformer', pillars: LANTERN.gdd.pillars });
    expect(answers['FreeformSystemsJson']).toEqual(LANTERN.systems);
    expect(answers['EntityRoster']).toEqual(LANTERN.roster);
    expect(answers['Objectives']).toEqual(LANTERN.objectives);
  });

  it("adapts the reference FSM the prompt carries for a behaviour another genre's entity runs", async () => {
    // A vault guarded by a swarm as well: the swarm chases as a survivors chaser does, a behaviour the base has not got.
    const roster = { ...HEIST.roster, types: [...HEIST.roster.types, { type: 'swarm', archetype: 'survivors:chaser', hp: 1 }] };
    const borrowed = freeformManifest(HEIST.systems, roster).defaultBehaviours.find((b) => b.id === 'chaser');
    expect(borrowed).toBeDefined();
    expect(BASE_MANIFESTS['topdown-action'].defaultBehaviours.some((b) => b.id === 'chaser')).toBe(false);
    const onHeist = new FakeProvider({ genre: BASE_MANIFESTS['topdown-action'], request: CreateRequest.parse({ prompt: HEIST.prompt, genre: 'freeform', dryRun: true }) });
    const prompt = `Behaviour id: chaser\n\nReference FSM for this id (adapt it to the game; keep the id):\n${JSON.stringify(borrowed)}`;
    const res = await onHeist.structured({ model: 'fake', system: '', prompt, schema: {}, schemaName: 'BehaviourFsm' });
    expect(res.data as BehaviourFsm).toEqual(borrowed);
  });
});

/** A worker stage's context for a game directory; a create request, or an edit with authored levels. */
function ctxFor(gameDir: string, opts: { request?: CreateRequest; levels?: LevelJson[] }): StageContext {
  return {
    jobId: 'j1',
    gameId: 'g1',
    spec: { stage: 'gdd', gate: [] },
    attempt: 1,
    workDir: join(gameDir, '..'),
    gameDir,
    policy: null,
    model: 'fake',
    provider: 'fake',
    store: {} as Store,
    log: () => {},
    dryRun: true,
    request: opts.request ?? null,
    route: opts.levels ? { designNotes: 'level editor', route: 'content', targets: opts.levels.map((l) => l.id), affectedScenes: [], confidence: 1, paramPatch: [] } : null,
    edit: opts.levels ? { message: 'level editor', dryRun: true, content: { levels: opts.levels } } : null,
    versionId: 'v1',
  };
}

/** An example's idea through the create stages the worker runs itself, with the dry-run provider. */
async function build(ex: FreeformExample): Promise<string> {
  const request = CreateRequest.parse({ prompt: ex.prompt, genre: 'freeform', scopeTier: ex.gdd.scopeTier, dryRun: true, seed: 1 });
  registerProvider('fake', new FakeProvider({ genre: BASE_MANIFESTS[guessBase(request.prompt)], request }));
  const gameDir = mkdtempSync(join(tmpdir(), `gg-freeform-stages-${ex.id}-`));
  dirs.push(gameDir);
  for (const stage of ['gdd', 'systems', 'composition', 'sprites', 'scaffold', 'behaviour', 'story', 'levels', 'prove']) {
    const out = await new WorkerRunner().run({ ...ctxFor(gameDir, { request }), spec: { stage, gate: [] } });
    expect(out.ok, `${stage}: ${out.summary}`).toBe(true);
  }
  return gameDir;
}

describe('freeform stages, end to end with the dry-run provider', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: the idea gets its base, a composition across genres, named entities and rules, and a winning run for every level`, async () => {
      const gameDir = await build(ex);
      const files = readGameFiles(gameDir);
      expect(files.gdd).toMatchObject({ genre: 'freeform', base: ex.systems.composition.base, scope: ex.gdd.scope });
      expect(files.systems).toEqual(ex.systems);
      expect(files.roster).toEqual(ex.roster);
      if (ex.objectives) expect(JSON.parse(readFileSync(join(gameDir, 'content', 'objectives.json'), 'utf8'))).toEqual(ex.objectives);
      // The content its idea decides (the moon garden's crops) and its cast's look, as the example has them.
      // (Its talk, as the story stage writes it: parsed, with the schema's defaults.)
      const asWritten = (key: string, value: unknown) => (key === 'sprites' ? SpriteSheet.parse(value) : key === 'dialogue' ? DialogueFile.parse(value) : value);
      for (const [key, value] of Object.entries(ex.content ?? {})) expect(JSON.parse(readFileSync(join(gameDir, 'content', `${key}.json`), 'utf8')), key).toEqual(asWritten(key, value));
      expect(checkGameSprites(gameDir).issues).toEqual([]);
      expect(readFileSync(join(gameDir, 'design', 'concept.md'), 'utf8')).toMatch(/- Genre: freeform, built on /);
      // Every behaviour the game runs fires only the entities it has (a renamed projectile under its new name).
      const m = freeformManifest(ex.systems, ex.roster);
      for (const b of readdirSync(join(gameDir, 'content', 'behaviour'))) {
        const fsm = JSON.parse(readFileSync(join(gameDir, 'content', 'behaviour', b), 'utf8')) as BehaviourFsm;
        expect(validateBehaviour(fsm, m.behaviourVocab, m.entityDefs.map((d) => d.type)).issues.filter((i) => i.severity === 'error'), b).toEqual([]);
      }
      const proofs = checkProofs(gameDir);
      expect(proofs.issues).toEqual([]);
      expect(proofs.metrics).toMatchObject({ proven: ex.gdd.scope.levels, replayed: true });
      // A story with people: each level holds the people the talk places in it, and the gate holds the story to the game.
      const story = exampleStory(ex);
      if (story?.people) {
        for (const { level, index } of readGameLevels(gameDir)) {
          expect(level.entities.filter((e) => typeof e.props['speaker'] === 'string').map((e) => e.props['speaker']).sort(), `${ex.id} ${level.id}`).toEqual(peopleOn(story, index).map((p) => p.speaker).sort());
        }
        expect(checkGameStory(gameDir)).toMatchObject({ ok: true, issues: [] });
      }
    }, 120_000);
  }
});

describe("a freeform game's authored levels", () => {
  it('are validated and proven at the seed they are played with, and written together with their runs', async () => {
    const gameDir = await build(LANTERN);
    const m = freeformManifest(LANTERN.systems, LANTERN.roster);
    const before = readGameFiles(gameDir).proofs.find((p) => p.level === 'l01')!;
    // Another layout for the first level, under the game's names.
    const authored: LevelJson = { ...m.levelGrammar.generate({ seed: 41, difficulty: 0.2 }), id: 'l01', name: 'Level 1' };
    const out = await new WorkerRunner().run({ ...ctxFor(gameDir, { levels: [authored] }), spec: { stage: 'apply-content', gate: [] } });
    expect(out.ok, out.summary).toBe(true);
    expect(out.summary).toMatch(/applied 1 authored level\(s\): l01 \((solver|explorer) \d+ s\)/);
    const after = readGameFiles(gameDir).proofs.find((p) => p.level === 'l01')!;
    expect(after.script).not.toEqual(before.script);
    expect(after.seed).toBe(1);
    expect(checkProofs(gameDir).issues).toEqual([]);
  }, 120_000);

  it('a level the validator turns down changes nothing: no level, no run', async () => {
    const gameDir = await build(LANTERN);
    const files = () => readdirSync(join(gameDir, 'content', 'proofs')).map((f) => readFileSync(join(gameDir, 'content', 'proofs', f), 'utf8'));
    const proofs = files();
    const level = readGameLevels(gameDir)[0]!.level;
    // A wall from floor to ceiling before the goal: no run can reach it.
    const solid = Object.entries(level.legend).find(([, k]) => k === 'solid')![0];
    const wallX = level.goal.x - 3;
    const rows = level.rows.map((row) => row.slice(0, wallX) + solid + row.slice(wallX + 1));
    const out = await new WorkerRunner().run({ ...ctxFor(gameDir, { levels: [{ ...level, rows }] }), spec: { stage: 'apply-content', gate: [] } });
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('semantic_invalid');
    expect(out.summary).toMatch(/level 'l01' rejected: .*goal/);
    expect(files()).toEqual(proofs);
    expect(readGameLevels(gameDir)[0]!.level).toEqual(level);
  }, 120_000);
});

describe('a freeform game with systems of its own', () => {
  it("is proven by its own prover, with its own code: the worker's prover in Node knows only the catalog", async () => {
    const gameDir = await build(HEIST);
    // A steady current that drags the player west: the runs recorded without it no longer win.
    writeFileSync(
      join(gameDir, 'src', 'systems', 'current.ts'),
      "import { defineSystem } from '@gg/sdk';\n\nexport const current = defineSystem<null>({\n  id: 'current',\n  init: () => null,\n  fixedUpdate(_s, _input, ctx) {\n    if (ctx.world.player.alive) ctx.move(ctx.world.player, -0.25, 0);\n  },\n});\n",
    );
    writeFileSync(join(gameDir, 'src', 'systems', 'index.ts'), "import type { SystemDef } from '@gg/sdk';\nimport { current } from './current.js';\n\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const BESPOKE: SystemDef<any>[] = [current];\n");
    writeFileSync(join(gameDir, 'design', 'mechanics.json'), JSON.stringify({ version: 1, mechanics: [{ id: 'current', summary: 'A steady current that drags the player west.' }] }));
    const before = readGameFiles(gameDir).proofs.map((p) => p.ticks);
    const out = await new WorkerRunner().run({ ...ctxFor(gameDir, {}), spec: { stage: 'prove', gate: [] } });
    expect(out.ok, out.summary).toBe(true);
    expect(out.summary).toMatch(/^proved 2 level\(s\) with the game's own systems/);
    expect(readGameFiles(gameDir).proofs.map((p) => p.ticks)).not.toEqual(before);
    // The gate leaves the replay to the game's own test, which has its code.
    expect(checkProofs(gameDir).metrics).toMatchObject({ replayed: false });
  }, 180_000);
});

describe("a level that waits for a player's winning run", () => {
  it('is proven by a run that wins when replayed on its version; one that does not is turned down with the reason', async () => {
    const gameDir = await build(LANTERN);
    const won = readGameFiles(gameDir).proofs.find((p) => p.level === 'l02')!;
    // As if no bot had won l02: the version ships without a run of it, and its evidence says it waits.
    rmSync(join(gameDir, 'content', 'proofs', 'l02.json'));
    const storeDir = mkdtempSync(join(tmpdir(), 'gg-verify-proof-store-'));
    const workRoot = mkdtempSync(join(tmpdir(), 'gg-verify-proof-work-'));
    dirs.push(storeDir, workRoot);
    const store = new FileStore(storeDir);
    const game = await store.createGame({ ownerId: 'maker', slug: 'moth', title: 'Moth', genre: 'freeform' });
    const cp = await checkpoint(store, gameDir, game.id, 'j0', 'publish');
    const version = await store.insertVersion({ gameId: game.id, kind: 'accepted', stage: 'publish', parentVersionId: null, jobId: null, sourcePath: cp.path, bundlePath: `bundles/g/${game.id}/v/1`, manifest: null, design: { evidence: { proofs: { l01: { by: 'explorer', ticks: 1 }, l02: null } } }, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: null });
    await store.acceptVersion(version.id);
    await expect(store.setListed(game.id, true)).rejects.toThrow('l02 has no recorded winning run yet');

    const verify = async (proof: Record<string, unknown>) => {
      const sent = (await store.submitProof({ gameId: game.id, versionId: version.id, level: 'l02', submittedBy: 'player-a', proof }))!;
      // A second run of the level waits until the first is replayed.
      expect(await store.submitProof({ gameId: game.id, versionId: version.id, level: 'l02', submittedBy: 'player-b', proof })).toBeNull();
      const job = (await store.claimJob('w1'))!;
      expect(job).toMatchObject({ id: sent.job.id, kind: 'verify_proof', userId: 'maker' });
      expect(await verifyProof({ store, job, templateDir: harness, workRoot })).toBe('succeeded');
      const row = (await store.getProof(sent.row.id))!;
      // The owner's job panel shows the replay as a stage, with its verdict.
      expect((await store.listEvents(job.id)).map((e) => `${e.stage}:${e.type}`)).toEqual(['verify:stage_started', ...(row.status === 'accepted' ? ['verify:gate_passed', 'verify:assistant_summary'] : ['verify:gate_failed']), 'verify:finished']);
      return row;
    };
    // Gives up halfway: the lanterns are not home.
    const half = Math.floor(won.ticks / 2);
    const short = await verify({ ...won, by: 'human', ticks: half, script: won.script.filter((g) => g.from < half).map((g) => ({ ...g, to: Math.min(g.to, half) })) });
    expect(short).toMatchObject({ status: 'rejected', reason: `l02 is not won when the run is replayed: after ${half} ticks the level is still being played` });
    expect(waitingLevels(await store.getVersion(version.id))).toEqual(['l02']);
    // Recorded at another seed: it would be a run of another level.
    expect(await verify({ ...won, by: 'human', seed: 7 })).toMatchObject({ status: 'rejected', reason: 'the run was recorded at seed 7; the game plays l02 at 2' });

    const accepted = await verify({ ...won, by: 'human' });
    expect(accepted.status).toBe('accepted');
    const head = (await store.getVersion(version.id))!;
    expect(waitingLevels(head)).toEqual([]);
    expect((head.design['evidence'] as { proofs: unknown }).proofs).toEqual({ l01: { by: 'explorer', ticks: 1 }, l02: { by: 'human', ticks: won.ticks } });
    expect((await store.setListed(game.id, true)).visibility).toBe('listed');
    // The level no longer waits: nothing more to replay.
    expect(await store.submitProof({ gameId: game.id, versionId: version.id, level: 'l02', submittedBy: 'player-c', proof: { ...won, by: 'human' } })).toBeNull();

    // An edit starts from the version's checkpoint, which has no run of l02: the player's comes along.
    const editDir = mkdtempSync(join(tmpdir(), 'gg-verify-proof-edit-'));
    dirs.push(editDir);
    expect(await restorePlayerRuns(store, version.id, editDir)).toEqual(['l02']);
    expect(JSON.parse(readFileSync(join(editDir, 'content', 'proofs', 'l02.json'), 'utf8'))).toEqual({ ...won, by: 'human' });
  }, 180_000);
});
