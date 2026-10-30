/** What the worker's stages share: outcomes, usage sums, and reading a game's design files. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerateResult, Usage } from '@gg/llm';
import { parseAnyGdd, parseSystemsFile, type AnyGddFrontmatter, type SystemsFile } from '@gg/schemas';
import { parseFrontmatter } from '@gg/validators';
import type { StageContext, StageOutcome } from './types.js';

export type StageFn = (ctx: StageContext) => Promise<StageOutcome>;

export const ZERO: Usage = { inputTokens: 0, outputTokens: 0 };
export const add = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, cachedTokens: (a.cachedTokens ?? 0) + (b.cachedTokens ?? 0) });
export const sumUsage = <T>(r: GenerateResult<T>): Usage => r.samples.reduce((acc, s) => add(acc, s.usage), { ...ZERO });
export const ok = (summary: string, extra: Partial<StageOutcome> = {}): StageOutcome => ({ ok: true, summary, usage: { ...ZERO }, costUsd: 0, durationMs: 0, turns: 0, ...extra });
export const fail = (summary: string, failureMode: StageOutcome['failureMode'], extra: Partial<StageOutcome> = {}): StageOutcome => ({ ok: false, summary, usage: { ...ZERO }, costUsd: 0, durationMs: 0, turns: 0, failureMode, ...extra });

export const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
export const writeJson = (p: string, v: unknown): void => {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

/** A game's GDD: the whole file, its front matter, and the markdown body under it. */
export function readGdd(gameDir: string): { md: string; fm: AnyGddFrontmatter; body: string } | null {
  const p = join(gameDir, 'design', 'gdd.md');
  if (!existsSync(p)) return null;
  const md = readFileSync(p, 'utf8');
  const fm = parseFrontmatter(md);
  const parsed = fm ? parseAnyGdd(fm.data) : null;
  return fm && parsed?.success ? { md, fm: parsed.data, body: fm.body } : null;
}

export function readSystems(gameDir: string): SystemsFile | null {
  const p = join(gameDir, 'design', 'systems.json');
  if (!existsSync(p)) return null;
  const parsed = parseSystemsFile(readJson(p));
  if (!parsed.success) throw new Error(`design/systems.json is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return parsed.data;
}

export function listJson(dir: string, suffix = '.json'): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(suffix)).sort().map((f) => join(dir, f)) : [];
}
