import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateArtifact, providerFor, type Usage } from '@gg/llm';
import type { SystemsFile } from '@gg/schemas';
import type { DesignContent } from '@gg/template-core';
import type { PairDraft, StageContext } from './types.js';
import { add, readJson, sumUsage, writeJson, ZERO } from './stage-kit.js';

const DESIGN_CONTENT_SYSTEM = [
  "You write a small 2D browser game's content as data: names, numbers and looks, from the game's idea and inside its rules.",
  "Fit every number to the rules you are given. Names are short and belong to the game's world.",
].join('\n');

/** What the prompt tells about the game: its GDD, and what an earlier stage named. */
export interface GameBrief {
  title: string;
  pillars: readonly string[];
  /** The GDD's markdown body (concept, core loop, progression), written from the sanitised idea. */
  body: string;
  /** What the stages decided that the content should agree with (a freeform game's entity names). */
  notes?: string;
  /** Hand-made content for this kind of idea, by key (a freeform example's), shown instead of the genre's own. */
  examples?: Readonly<Record<string, unknown>>;
}

export interface DesignContentOutcome {
  /** The files written, as content/<key>.json. */
  written: string[];
  notes: string[];
  usage: Usage;
  costUsd: number;
  turns: number;
  pairs: PairDraft[];
}

/** A content file's value; undefined when it is missing or not JSON (the gate names what is wrong with it). */
function readContent(path: string): unknown {
  try {
    return existsSync(path) ? readJson<unknown>(path) : undefined;
  } catch {
    return undefined;
  }
}

/** The design content files a game has on disk, by key: what its scaffold and its proofs play with. */
export function designContentOf(gameDir: string, entries: readonly DesignContent[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of entries) {
    const value = readContent(join(gameDir, 'content', `${d.key}.json`));
    if (value !== undefined) out[d.key] = value;
  }
  return out;
}

/**
 * Writes the content files a game's systems read and its idea decides (a farm's crops: content/crops.json), one
 * structured call each. Everything the content's check finds, errors and warnings, goes back to the model as a repair.
 * A file that already holds for the game's rules is kept, so a stage run again does not roll it anew; a value no answer
 * gets right falls back to the genre's own.
 */
export async function writeDesignContent(ctx: StageContext, entries: readonly DesignContent[], systems: SystemsFile, brief: GameBrief): Promise<DesignContentOutcome> {
  const out: DesignContentOutcome = { written: [], notes: [], usage: { ...ZERO }, costUsd: 0, turns: 0, pairs: [] };
  for (const d of entries) {
    const path = join(ctx.gameDir, 'content', `${d.key}.json`);
    const existing = readContent(path);
    if (existing !== undefined && !d.check(existing, systems).some((i) => i.severity === 'error')) {
      out.notes.push(`kept content/${d.key}.json`);
      continue;
    }
    const prompt = [
      `Game: "${brief.title}". Pillars: ${brief.pillars.join(' / ')}.`,
      `Design document:\n${brief.body.trim().slice(0, 4000)}`,
      brief.notes ?? '',
      `Rules: ${d.rules(systems)}`,
      d.guide.trim(),
      `Example (its shape and balance; the content you write is this game's own):\n${JSON.stringify(brief.examples?.[d.key] ?? d.fallback)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const res = await generateArtifact<unknown>({
      provider: providerFor(ctx.provider),
      model: ctx.model,
      artifact: d.artifact,
      system: DESIGN_CONTENT_SYSTEM,
      prompt,
      k: ctx.policy?.k ?? 1,
      repairRounds: ctx.policy?.repairRounds ?? 1,
      verify: (v) => d.check(v, systems).map((i) => i.message),
      score: d.score,
    });
    out.usage = add(out.usage, sumUsage(res));
    out.costUsd += res.totalCostUsd;
    out.turns += res.samples.length;
    const value = res.selected?.value;
    if (value !== undefined) out.pairs.push({ artifact: d.artifact, system: DESIGN_CONTENT_SYSTEM, prompt, output: value });
    else out.notes.push(`${d.key}: ${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); using the genre's own`);
    writeJson(path, value ?? d.fallback);
    out.written.push(`content/${d.key}.json`);
  }
  return out;
}
