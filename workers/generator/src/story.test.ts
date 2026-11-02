import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Store } from '@gg/db';
import { registerProvider, type Provider, type StructuredRequest, type StructuredResponse, type TextRequest, type TextResponse } from '@gg/llm';
import { CreateRequest, DialogueFile, GAME_EVENTS, StoryBible, UNSTABLE_DEED_EVENTS, type CuratedGenre } from '@gg/schemas';
import { plannedLevelCount } from '@gg/template-core';
import { BASE_MANIFESTS, LOSTDOG } from '@gg/template-freeform/node';
import { checkGameStory, genre, GENRES, storyFactsOf } from '@gg/templates/node';
import { checkStory } from '@gg/validators';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import { createPlan } from './plan.js';
import { loadPresets } from './presets.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';
import { draftStory, wantsStory } from './story-draft.js';

const harness = resolve(fileURLToPath(new URL('../../../harness', import.meta.url)));
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const newGame = () => {
  const dir = mkdtempSync(join(tmpdir(), 'gg-story-'));
  dirs.push(dir);
  return dir;
};
const requestOf = (genreId: string, prompt: string) => CreateRequest.parse({ prompt, genre: genreId, scopeTier: 'small', dryRun: true, seed: 1 });
function ctxFor(gameDir: string, provider: string, stage: string, request: CreateRequest): StageContext {
  return { jobId: 'j1', gameId: 'g1', spec: { stage, gate: [] }, attempt: 1, workDir: join(gameDir, '..'), gameDir, policy: null, model: 'fake', provider, store: {} as Store, log: () => {}, dryRun: true, request, route: null, edit: null, versionId: 'v1' };
}
async function run(gameDir: string, provider: string, request: CreateRequest, stages: string[]) {
  const outs = [];
  for (const stage of stages) {
    const out = await new WorkerRunner().run(ctxFor(gameDir, provider, stage, request));
    expect(out.ok, `${stage}: ${out.summary}`).toBe(true);
    outs.push(out);
  }
  return outs;
}
const read = (gameDir: string, path: string) => JSON.parse(readFileSync(join(gameDir, path), 'utf8')) as unknown;

/** The dry-run provider, except that each talk asked for is `talk`; every story prompt is kept. */
class TalkProvider implements Provider {
  readonly name = 'talks';
  readonly prompts: string[] = [];
  constructor(
    private readonly fake: FakeProvider,
    private readonly talk: unknown,
  ) {}
  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    if (req.schemaName !== 'DialogueFile') return this.fake.structured(req);
    this.prompts.push(req.prompt);
    return { data: this.talk, usage: { inputTokens: 10, outputTokens: 5 } };
  }
  async text(req: TextRequest): Promise<TextResponse> {
    return this.fake.text(req);
  }
}

describe('the story stage', () => {
  it('runs for every game once its code is known, before its levels', () => {
    const presets = loadPresets(harness);
    for (const freeform of [false, true]) {
      const plan = createPlan(presets, { freeform }).map((s) => s.stage);
      expect(plan.indexOf('story')).toBe(plan.indexOf(freeform ? 'prove' : 'implement') + 1);
      expect(plan[plan.indexOf('story') + 1]).toBe('levels');
    }
    expect(presets['story']).toMatchObject({ runner: 'worker', gate: ['validate:story'] });
  });

  it('gives an idea that asks for no story none: the plan says so, and no talk is written', async () => {
    const request = requestOf('platformer', 'A tight cave platformer about a mole who dashes through crumbling tunnels.');
    registerProvider('fake', new FakeProvider({ genre: genre('platformer'), request }));
    const gameDir = newGame();
    const [, , out] = await run(gameDir, 'fake', request, ['gdd', 'systems', 'story']);
    expect(out!.summary).toMatch(/depth none/);
    expect(StoryBible.parse(read(gameDir, 'design/story.json')).depth).toBe('none');
    expect(existsSync(join(gameDir, 'content', 'dialogue.json'))).toBe(false);
    expect(checkGameStory(gameDir).ok).toBe(true);
  });

  it('tells an idea that asks for a story a light one: a prologue, a chapter for each level, an ending, held to the game', async () => {
    const request = requestOf('platformer', 'The tale of a mole who digs up through the crumbling tunnels to see the sun.');
    registerProvider('fake', new FakeProvider({ genre: genre('platformer'), request }));
    const gameDir = newGame();
    await run(gameDir, 'fake', request, ['gdd', 'systems', 'story']);
    const talk = DialogueFile.parse(read(gameDir, 'content/dialogue.json'));
    const levels = storyFactsOf(gameDir).levels;
    expect(levels).toBeGreaterThan(1);
    expect([talk.chapters?.length, talk.chapters?.[0]?.node, talk.endings?.length, talk.starts]).toEqual([levels, 'prologue', 1, []]);
    // Heard: the ending's event is bound, and the gate holds the story to the game.
    expect(read(gameDir, 'design/feedback.json')).toEqual(expect.arrayContaining([{ event: 'custom:ending', channels: ['sfx'] }]));
    expect(checkGameStory(gameDir)).toMatchObject({ ok: true, issues: [] });
  });

  it("tells a castle game its genre's story: rich, its people, its deeds and endings", async () => {
    const request = requestOf('castle', 'A gothic castle where a cursed knight climbs toward a broken bell.');
    registerProvider('fake', new FakeProvider({ genre: genre('castle'), request }));
    const gameDir = newGame();
    await run(gameDir, 'fake', request, ['gdd', 'systems', 'story']);
    expect(StoryBible.parse(read(gameDir, 'design/story.json')).depth).toBe('rich');
    expect(read(gameDir, 'content/dialogue.json')).toEqual(JSON.parse(JSON.stringify(genre('castle').shippedContent!['dialogue'])));
    expect(checkGameStory(gameDir)).toMatchObject({ ok: true, issues: [] });
  });

  it('sends a talk back with what breaks it, and keeps none that never holds', async () => {
    const request = requestOf('platformer', 'The tale of a mole who digs up to see the sun.');
    const fake = new FakeProvider({ genre: genre('platformer'), request });
    const bad = { version: 1, nodes: [{ id: 'end', speaker: 'narrator', lines: ['The end.'] }], deeds: [{ on: 'custom:ring', set: { rung: true } }], endings: [{ id: 'rung', title: 'Rung', when: [{ flag: 'rung', is: true }], node: 'end' }, { id: 'quiet', title: 'Quiet', node: 'end' }], starts: [{ speaker: 'oracle', node: 'end' }] };
    const provider = new TalkProvider(fake, bad);
    registerProvider('fake', fake);
    registerProvider('talks', provider);
    const gameDir = newGame();
    await run(gameDir, 'fake', request, ['gdd', 'systems']);
    const [out] = await run(gameDir, 'talks', request, ['story']);
    expect(out!.summary).toMatch(/no talk held/);
    expect(existsSync(join(gameDir, 'content', 'dialogue.json'))).toBe(false);
    // The repair prompt names what is wrong: nobody to talk to, an event the game never emits.
    expect(provider.prompts.at(-1)).toMatch(/oracle/);
    expect(provider.prompts.at(-1)).toMatch(/custom:ring/);
  });
});

describe('a composed game with people to talk to', () => {
  it('is told to place its people, and shown a talk told well for its craft alone; the talk it writes places them', async () => {
    const request = CreateRequest.parse({ prompt: LOSTDOG.prompt, genre: 'freeform', scopeTier: 'small', dryRun: true, seed: 1 });
    const fake = new FakeProvider({ genre: BASE_MANIFESTS['topdown-action'], request });
    const provider = new TalkProvider(fake, LOSTDOG.content!['dialogue']);
    registerProvider('fake', fake);
    registerProvider('talks', provider);
    const gameDir = newGame();
    await run(gameDir, 'fake', request, ['gdd', 'systems', 'composition']);
    expect(storyFactsOf(gameDir).people).toBe(true);
    await run(gameDir, 'talks', request, ['story']);
    const prompt = provider.prompts.at(-1)!;
    expect(prompt).toMatch(/people \[\{ speaker, level, near: start \| middle \| end, look \}\]/);
    expect(prompt).toMatch(/^A well-told talk from another game, for its craft only/m);
    // The craft talk is never what a dry run answers with: only the example of the talk's shape is.
    expect(prompt.match(/^Example \(a talk's shape/gm)).toHaveLength(1);
    expect(DialogueFile.parse(read(gameDir, 'content/dialogue.json')).people).toHaveLength(4);
    expect(checkGameStory(gameDir)).toMatchObject({ ok: true, issues: [] });
  });
});

describe('the drafted stories', () => {
  it('ask for a story only when the idea does', () => {
    expect([wantsStory('A tale of two moles'), wantsStory('villagers to talk to'), wantsStory('A cave platformer about a mole')]).toEqual([true, true, false]);
  });

  it("hold for every genre: a light one where the idea asks, the castle's own rich one", () => {
    for (const id of Object.keys(GENRES) as CuratedGenre[]) {
      const g = GENRES[id]!;
      const events = [...GAME_EVENTS.filter((e) => !UNSTABLE_DEED_EVENTS.includes(e)), 'custom:dialogue', 'custom:dialogue_choice', 'custom:quest', ...Object.values(g.systems).flatMap((s) => [...(s.meta.emits ?? [])])];
      const levels = plannedLevelCount(g.levelGrammar.kind, g.scopeBudget.small.levels);
      const facts = { speakers: g.entityDefs.filter((d) => (d as { npc?: boolean }).npc === true).map((d) => d.type), events, types: g.entityDefs.map((d) => d.type), levels };
      const gdd = { title: 'The Long Way', pillars: ['the climb', 'the fall', 'the light'] } as never;
      const drafted = draftStory({ genre: g, gdd, levels, idea: 'a tale' });
      expect(drafted.dialogue, id).not.toBeNull();
      const r = checkStory(drafted.dialogue!, facts);
      expect(r.issues, id).toEqual([]);
      expect(drafted.bible.depth, id).toBe(id === 'castle' ? 'rich' : 'light');
    }
  });
});
