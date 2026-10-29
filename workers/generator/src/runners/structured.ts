import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateArtifact, providerFor } from '@gg/llm';
import type { ArtifactName } from '@gg/schemas';
import type { Runner, StageContext, StageOutcome } from './types.js';

const DEFAULT_SYSTEM = [
  'You produce one JSON artifact for a 2D browser game built on a fixed runtime.',
  'Use only the vocabulary the schema allows. Put a short designNotes line first when the schema has one.',
  'Keep artifacts small and concrete; prefer two to five states or entries over many.',
].join('\n');

/**
 * Data-tier stage: k samples of one schema-constrained artifact, validated, repaired and selected,
 * then written to the game's content/design directory. No agent session, no code.
 */
export class StructuredRunner implements Runner {
  readonly kind = 'structured' as const;

  async run(ctx: StageContext): Promise<StageOutcome> {
    const t0 = Date.now();
    const art = ctx.spec.artifact;
    if (!art) return { ok: false, summary: 'structured stage needs spec.artifact', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, durationMs: 0, turns: 0, failureMode: 'spec_violation' };
    const gddPath = join(ctx.gameDir, 'design', 'gdd.md');
    const context = existsSync(gddPath) ? readFileSync(gddPath, 'utf8').slice(0, 6000) : '';
    const prompt = [ctx.spec.task ?? `Produce the ${art.name} artifact.`, context ? `\n# Game design document\n${context}` : ''].join('\n');
    const system = art.system ?? DEFAULT_SYSTEM;
    const res = await generateArtifact<unknown>({
      provider: providerFor(ctx.provider),
      model: ctx.model,
      artifact: art.name as ArtifactName,
      system,
      prompt,
      k: ctx.policy?.k ?? 1,
      repairRounds: ctx.policy?.repairRounds ?? 1,
    });
    const usage = res.samples.reduce(
      (acc, s) => ({ inputTokens: acc.inputTokens + s.usage.inputTokens, outputTokens: acc.outputTokens + s.usage.outputTokens, cachedTokens: (acc.cachedTokens ?? 0) + (s.usage.cachedTokens ?? 0) }),
      { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    );
    if (!res.selected) {
      return { ok: false, summary: `no sample passed (${res.samples.length} tried): ${res.samples[0]?.issues?.slice(0, 3).join('; ')}`, usage, costUsd: res.totalCostUsd, durationMs: Date.now() - t0, turns: res.samples.length, failureMode: 'schema_invalid' };
    }
    const out = join(ctx.gameDir, art.outPath);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(res.selected.value, null, 2) + '\n');
    ctx.log(`wrote ${art.name} -> ${art.outPath} (selected sample ${res.selected.index} of ${res.samples.length})`);
    return { ok: true, summary: `wrote ${art.outPath}`, usage, costUsd: res.totalCostUsd, durationMs: Date.now() - t0, turns: res.samples.length, artifactPath: out, promptHash: res.selected.promptHash, pairs: [{ artifact: art.name, system, prompt, output: res.selected.value }] };
  }
}
