import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@gg/db';
import { registerProvider, type Provider, type StructuredRequest, type StructuredResponse, type TextRequest, type TextResponse } from '@gg/llm';
import { CreateRequest, SpriteSheet } from '@gg/schemas';
import { artPalette } from '@gg/sdk/art';
import { castOf, checkGameSprites, genre } from '@gg/templates/node';
import { checkSpriteSheet } from '@gg/validators';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import { describeBase, salvageSprites } from './runners/sprites.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const survivors = genre('survivors');
const request = CreateRequest.parse({ prompt: 'A lone knight holding a hill against green slimes until dawn.', genre: 'survivors', scopeTier: 'small', dryRun: true, seed: 1 });

/** A knight in grey steel with a gold plume, and the chasers as green slimes: a look the art rules pass. */
const KNIGHT = {
  version: 1,
  sprites: [
    { type: '@player', base: 'hero-topdown', recolor: { garment: '#8a96a8', accent: '#d9b44a' }, overlays: [{ anims: ['down-idle', 'down-run', 'down-attack', 'down-hurt'], x: 1, y: 3, rows: ['kkkkkk'] }] },
    { type: 'chaser', base: 'bat', recolor: { danger: '#5dbb63' } },
  ],
};

function ctxFor(gameDir: string, provider: string, stage: string): StageContext {
  return { jobId: 'j1', gameId: 'g1', spec: { stage, gate: [] }, attempt: 1, workDir: join(gameDir, '..'), gameDir, policy: null, model: 'fake', provider, store: {} as Store, log: () => {}, dryRun: true, request, route: null, edit: null, versionId: 'v1' };
}

/** The dry-run provider, except that sprite sheets come from `sheets` (each call the next, then the last again) and every prompt is kept. */
class SheetProvider implements Provider {
  readonly name = 'sheets';
  readonly prompts: string[] = [];
  private readonly fake = new FakeProvider({ genre: survivors, request });
  constructor(private readonly sheets: readonly unknown[]) {}
  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    if (req.schemaName !== 'SpriteSheet') return this.fake.structured(req);
    this.prompts.push(req.prompt);
    return { data: this.sheets[Math.min(this.prompts.length, this.sheets.length) - 1], usage: { inputTokens: 10, outputTokens: 5 } };
  }
  async text(req: TextRequest): Promise<TextResponse> {
    return this.fake.text(req);
  }
}

async function run(gameDir: string, provider: string, stages: string[]) {
  const outs = [];
  for (const stage of stages) {
    const out = await new WorkerRunner().run(ctxFor(gameDir, provider, stage));
    expect(out.ok, `${stage}: ${out.summary}`).toBe(true);
    outs.push(out);
  }
  return outs;
}

const newGame = () => {
  const dir = mkdtempSync(join(tmpdir(), 'gg-sprites-'));
  dirs.push(dir);
  return dir;
};
const sheetOf = (gameDir: string) => JSON.parse(readFileSync(join(gameDir, 'content', 'sprites.json'), 'utf8')) as unknown;

describe("a game's cast, given its own look once its entities are known", () => {
  it('a curated dry run draws as it ships, and the gate passes the empty sheet', async () => {
    registerProvider('fake', new FakeProvider({ genre: survivors, request }));
    const gameDir = newGame();
    const [, , sprites] = await run(gameDir, 'fake', ['gdd', 'systems', 'sprites']);
    expect(sprites!.summary).toMatch(/no designs: the cast draws as it ships/);
    expect(sheetOf(gameDir)).toEqual({ version: 1, sprites: [] });
    expect(checkGameSprites(gameDir)).toMatchObject({ ok: true, issues: [] });
  });

  it('a sheet for the idea is written as it came; the prompt carries the cast, the sprites each may start from, the rules and an example', async () => {
    const provider = new SheetProvider([KNIGHT]);
    registerProvider('sheets-knight', provider);
    const gameDir = newGame();
    const [, , sprites] = await run(gameDir, 'sheets-knight', ['gdd', 'systems', 'sprites']);
    expect(sheetOf(gameDir)).toEqual(SpriteSheet.parse(KNIGHT));
    expect(sprites!.summary).toMatch(/@player<hero-topdown, chaser<bat/);
    // Each design beside the sprite it starts from, for review.
    expect(readFileSync(join(gameDir, 'reports', 'sprites.png')).subarray(1, 4).toString()).toBe('PNG');
    expect(sprites!.pairs).toHaveLength(1);
    expect(checkGameSprites(gameDir).issues).toEqual([]);
    const prompt = provider.prompts[0]!;
    expect(prompt).toContain('- @player (the player): drawn as hero-topdown; may start from hero-topdown, farmer');
    expect(prompt).toContain('- chaser (hostile): drawn as bat; may start from bat, ship, drone, wings, boots');
    expect(prompt).toContain(describeBase('hero-topdown'));
    expect(prompt).toContain(describeBase('brute'));
    expect(prompt).toMatch(/danger #ef476f \(the hue of what hurts/);
    expect(prompt).toMatch(/a foe never wears the player's colours/);
    expect(prompt).toMatch(/^Example \(another game's designs[^\n]*\n\{"version":1,"sprites":\[\{"type":"@player"/m);
  });

  it('a design that breaks a rule goes back with the reason; when no answer passes, the designs that hold are kept', async () => {
    const offFrame = { version: 1, sprites: [KNIGHT.sprites[0], { type: 'chaser', base: 'bat', overlays: [{ x: 6, y: 0, rows: ['kkk'] }] }] };
    const provider = new SheetProvider([offFrame]);
    registerProvider('sheets-off', provider);
    const gameDir = newGame();
    const [, , sprites] = await run(gameDir, 'sheets-off', ['gdd', 'systems', 'sprites']);
    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toMatch(/rejected for these reasons[\s\S]*chaser: an overlay of 3 x 1 at 6,0 runs off the 8 x 8 frame of 'bat'/);
    expect((sheetOf(gameDir) as SpriteSheet).sprites.map((d) => d.type)).toEqual(['@player']);
    expect(sprites!.summary).toMatch(/kept 1 design\(s\) that hold/);
    expect(sprites!.pairs).toEqual([]);
    expect(checkGameSprites(gameDir).ok).toBe(true);
  });

  it('a sheet on disk that holds is kept as it is; one that does not is designed again', async () => {
    const provider = new SheetProvider([KNIGHT]);
    registerProvider('sheets-keep', provider);
    const gameDir = newGame();
    await run(gameDir, 'sheets-keep', ['gdd', 'systems', 'sprites']);
    const [again] = await run(gameDir, 'sheets-keep', ['sprites']);
    expect(again!.summary).toBe('kept content/sprites.json (2 designs)');
    expect(provider.prompts).toHaveLength(1);
    writeFileSync(join(gameDir, 'content', 'sprites.json'), JSON.stringify({ version: 1, sprites: [{ type: 'ghost', base: 'bat' }] }));
    await run(gameDir, 'sheets-keep', ['sprites']);
    expect(provider.prompts).toHaveLength(2);
    expect(sheetOf(gameDir)).toEqual(SpriteSheet.parse(KNIGHT));
  });
});

describe("what of a sprite answer is kept when the answer does not pass", () => {
  const pal = artPalette({ background: '#14101c', mid: '#3d3550', foreground: '#f6f1d1', accent: '#8bd3dd', danger: '#f26b5b', ui: '#ffffff' });
  const check = (s: SpriteSheet) => checkSpriteSheet(s, { pal, types: castOf({}, 'survivors') });

  it('leaves out a design with an error and a foe in the player colours; the rest holds and stays', () => {
    const answer = SpriteSheet.parse({
      version: 1,
      sprites: [
        KNIGHT.sprites[0],
        { type: 'chaser', base: 'walker' },
        { type: 'brute', base: 'brute', recolor: { danger: '#8a96a8' } },
        { type: 'xp', base: 'crystal', recolor: { secondary: '#ffd75e' } },
      ],
    });
    expect(check(answer).issues.map((i) => `${i.at?.path} ${i.code}`)).toEqual(['chaser sprite_build', 'brute looks_like_player']);
    const kept = salvageSprites(answer, check);
    expect(kept.sprites.map((d) => d.type)).toEqual(['@player', 'xp']);
    expect(check(kept).issues).toEqual([]);
  });

  it("drops a player's design that wears the colours of the foes as they ship", () => {
    const red = SpriteSheet.parse({ version: 1, sprites: [{ type: '@player', base: 'hero-topdown', recolor: { garment: '#f26b5b', accent: '#f26b5b' } }] });
    expect(salvageSprites(red, check).sprites).toEqual([]);
  });
});
