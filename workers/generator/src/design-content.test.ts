import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@gg/db';
import { registerProvider, type Provider, type StructuredRequest, type StructuredResponse, type TextRequest, type TextResponse } from '@gg/llm';
import { CreateRequest, type CropTable } from '@gg/schemas';
import { MOON } from '@gg/template-freeform/node';
import { genre } from '@gg/templates/node';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const lifesim = genre('lifesim');
const DEFAULTS = lifesim.designContent![0]!.fallback as CropTable;
const MOON_CROPS = MOON.content!['crops'] as CropTable;
const request = CreateRequest.parse({ prompt: 'A cosy farm on the moon: moon melons and starfruit under the stars.', genre: 'lifesim', scopeTier: 'small', dryRun: true, seed: 1 });

function ctxFor(gameDir: string, provider: string, stage: string): StageContext {
  return { jobId: 'j1', gameId: 'g1', spec: { stage, gate: [] }, attempt: 1, workDir: join(gameDir, '..'), gameDir, policy: null, model: 'fake', provider, store: {} as Store, log: () => {}, dryRun: true, request, route: null, edit: null, versionId: 'v1' };
}

/** The dry-run provider, except that crop tables come from `crops` (each call the next, then the last again) and every prompt is kept. */
class CropProvider implements Provider {
  readonly name = 'crops';
  readonly prompts: string[] = [];
  private readonly fake = new FakeProvider({ genre: lifesim, request });
  constructor(private readonly crops: readonly unknown[]) {}
  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    if (req.schemaName !== 'CropTable') return this.fake.structured(req);
    this.prompts.push(req.prompt);
    return { data: this.crops[Math.min(this.prompts.length, this.crops.length) - 1], usage: { inputTokens: 10, outputTokens: 5 } };
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
  const dir = mkdtempSync(join(tmpdir(), 'gg-design-content-'));
  dirs.push(dir);
  return dir;
};
const cropsOf = (gameDir: string) => JSON.parse(readFileSync(join(gameDir, 'content', 'crops.json'), 'utf8')) as CropTable;

describe("a farm's crops, written from the idea after its systems", () => {
  it('the dry run writes the genre crops it was shown, and the seasons are proven with them', async () => {
    registerProvider('fake', new FakeProvider({ genre: lifesim, request }));
    const gameDir = newGame();
    const [, systems] = await run(gameDir, 'fake', ['gdd', 'systems', 'scaffold', 'levels']);
    expect(systems!.summary).toMatch(/and content\/crops\.json/);
    expect(cropsOf(gameDir)).toEqual(DEFAULTS);
  }, 120_000);

  it("a table for the idea is written as it came; the prompt carries the game's rules, the guide and an example", async () => {
    const provider = new CropProvider([MOON_CROPS]);
    registerProvider('crops-moon', provider);
    const gameDir = newGame();
    const [, systems] = await run(gameDir, 'crops-moon', ['gdd', 'systems']);
    expect(cropsOf(gameDir)).toEqual(MOON_CROPS);
    expect(systems!.pairs?.map((p) => p.artifact)).toEqual(['SystemsJson', 'CropTable']);
    const prompt = provider.prompts[0]!;
    expect(prompt).toMatch(/^Rules: A season of 7 days/m);
    expect(prompt).toMatch(/at most 10 letters/);
    expect(prompt).toMatch(/moon melons/);
    expect(prompt).toContain(JSON.stringify(DEFAULTS));
    // Run again, the stage keeps the table it wrote: it still holds for the rules.
    const [again] = await run(gameDir, 'crops-moon', ['systems']);
    expect(again!.summary).toMatch(/kept content\/crops\.json/);
    expect(provider.prompts).toHaveLength(1);
    // A file that is no longer JSON (a hand edit gone wrong) is written anew.
    writeFileSync(join(gameDir, 'content', 'crops.json'), '{ "version": 1, ');
    await run(gameDir, 'crops-moon', ['systems']);
    expect(provider.prompts).toHaveLength(2);
    expect(cropsOf(gameDir)).toEqual(MOON_CROPS);
  }, 60_000);

  it('a table that leaves nothing to farm is sent back with the reason, and the genre crops stand in when no answer holds', async () => {
    const barren: CropTable = { version: 1, crops: MOON_CROPS.crops.map((c) => ({ id: c.id, name: c.name, seedPrice: c.seedPrice, sellPrice: c.seedPrice + 1, growDays: c.growDays, look: c.look })) };
    const provider = new CropProvider([barren, barren]);
    registerProvider('crops-barren', provider);
    const gameDir = newGame();
    const [, systems] = await run(gameDir, 'crops-barren', ['gdd', 'systems']);
    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toMatch(/rejected for these reasons[\s\S]*earns only/);
    expect(systems!.summary).toMatch(/crops: 2 samples rejected \(an ideal season on 12 plots earns only .*\); using the genre's own/);
    expect(cropsOf(gameDir)).toEqual(DEFAULTS);
    expect(systems!.pairs?.map((p) => p.artifact)).toEqual(['SystemsJson']);
  }, 60_000);

  it('a poor buy is a repair too: the second answer, without it, is the one written', async () => {
    const trap: CropTable = { version: 1, crops: [...MOON_CROPS.crops.slice(0, 3), { ...MOON_CROPS.crops[3]!, growDays: 9 }] };
    const provider = new CropProvider([trap, MOON_CROPS]);
    registerProvider('crops-trap', provider);
    const gameDir = newGame();
    await run(gameDir, 'crops-trap', ['gdd', 'systems']);
    expect(provider.prompts[1]).toMatch(/Nightlily takes 9 days and never ripens in a 7-day season/);
    expect(cropsOf(gameDir)).toEqual(MOON_CROPS);
  }, 60_000);
});
