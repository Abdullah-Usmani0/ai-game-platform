import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@gg/db';
import { registerProvider, type Provider, type StructuredRequest, type StructuredResponse, type TextRequest, type TextResponse } from '@gg/llm';
import { CreateRequest } from '@gg/schemas';
import { genre } from '@gg/templates/node';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeProvider } from './fake-provider.js';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';

const request = CreateRequest.parse({
  prompt: 'A knight with a hornet familiar climbs a drowned abbey, like Blasphemous and Metroid Dread, past the gates of Hallownest.',
  genre: 'metroidvania',
  scopeTier: 'small',
  referenceTitles: ['Hollow Knight', 'Metroid Dread'],
});

/** The dry run's answers under another name, recording every prompt the stage sends. */
class RecordingProvider implements Provider {
  readonly name = 'recording';
  readonly prompts: string[] = [];
  private readonly inner = new FakeProvider({ genre: genre('metroidvania'), request });

  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    this.prompts.push(req.prompt);
    return this.inner.structured(req);
  }

  async text(req: TextRequest): Promise<TextResponse> {
    this.prompts.push(req.prompt);
    return this.inner.text(req);
  }
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('references in a create request', () => {
  it('keep every named title and name out of the prompts and the GDD, keep ordinary words, and style the game', async () => {
    const provider = new RecordingProvider();
    registerProvider('recording-references', provider);
    const gameDir = mkdtempSync(join(tmpdir(), 'gg-references-'));
    dirs.push(gameDir);
    const ctx: StageContext = {
      jobId: 'j1',
      gameId: 'g1',
      spec: { stage: 'gdd', gate: [] },
      attempt: 1,
      workDir: join(gameDir, '..'),
      gameDir,
      policy: null,
      model: 'recording-1',
      provider: 'recording-references',
      store: {} as Store,
      log: () => {},
      dryRun: false,
      request,
      route: null,
      edit: null,
      versionId: 'v1',
    };
    const res = await new WorkerRunner().run(ctx);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('kept as ordinary words: Knight, Hornet');
    expect(provider.prompts.length).toBeGreaterThan(0);
    const gdd = readFileSync(join(gameDir, 'design', 'gdd.md'), 'utf8');
    for (const text of [...provider.prompts, gdd]) {
      expect(text).not.toMatch(/\b(Blasphemous|Metroid|Hollow Knight|Hallownest)\b/i);
    }
    expect(provider.prompts.some((p) => p.includes('A knight with a hornet familiar climbs a drowned abbey'))).toBe(true);
    // The first named reference styles the game; the cited one joins the private concept.
    const style = JSON.parse(readFileSync(join(gameDir, 'design', 'style.json'), 'utf8')) as { family: string };
    expect(style.family).toBe('painted');
    const concept = readFileSync(join(gameDir, 'design', 'concept.md'), 'utf8');
    expect(concept).toContain('Style references (private): Hollow Knight, Blasphemous');
    expect(concept).toContain('Unresolved references: Metroid Dread');
  });
});
