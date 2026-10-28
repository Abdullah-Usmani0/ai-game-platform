import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import { ARTIFACT_SCHEMAS, toJsonSchema, type ArtifactName } from '@gg/schemas';
import { costUsd, type Usage } from './pricing.js';
import type { Provider } from './provider.js';

export interface Sample<T> {
  index: number;
  ok: boolean;
  value?: T;
  issues?: string[];
  usage: Usage;
  costUsd: number;
  durationMs: number;
  promptHash: string;
}

export interface GenerateOptions<T> {
  provider: Provider;
  model: string;
  artifact: ArtifactName;
  system: string;
  prompt: string;
  /** Number of independent samples to draw (the k in sample-verify-select). */
  k?: number;
  temperature?: number;
  /** Deterministic verifier beyond the schema: return [] to accept, else the problems found. */
  verify?: (value: T) => string[] | Promise<string[]>;
  /** Repair rounds: on failure, re-prompt once with the issues appended (scrubbing the failed output). */
  repairRounds?: number;
  /** Rank accepted samples; the highest score is selected. Default: first accepted. */
  score?: (value: T) => number;
}

export interface GenerateResult<T> {
  selected: Sample<T> | null;
  samples: Sample<T>[];
  totalCostUsd: number;
}

export function promptHash(system: string, prompt: string, schemaName: string): string {
  return createHash('sha256').update(`${schemaName}\n${system}\n${prompt}`).digest('hex').slice(0, 16);
}

/**
 * sample k -> validate (schema + verifier) -> repair (issues as text, failed output scrubbed) -> select.
 * This is the model-agnostic loop for every data-tier artifact. The caller escalates when `selected` is null.
 */
export async function generateArtifact<T>(opts: GenerateOptions<T>): Promise<GenerateResult<T>> {
  const schema = ARTIFACT_SCHEMAS[opts.artifact] as unknown as ZodType<T>;
  const jsonSchema = toJsonSchema(opts.artifact);
  const k = opts.k ?? 1;
  const rounds = opts.repairRounds ?? 1;
  const samples: Sample<T>[] = [];
  let total = 0;

  const attempt = async (index: number, prompt: string): Promise<Sample<T>> => {
    const t0 = Date.now();
    const hash = promptHash(opts.system, prompt, opts.artifact);
    try {
      const res = await opts.provider.structured({ model: opts.model, system: opts.system, prompt, schema: jsonSchema, schemaName: opts.artifact, temperature: opts.temperature });
      const cost = costUsd(opts.model, res.usage);
      total += cost;
      const parsed = schema.safeParse(res.data);
      if (!parsed.success) {
        return { index, ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`), usage: res.usage, costUsd: cost, durationMs: Date.now() - t0, promptHash: hash };
      }
      const problems = opts.verify ? await opts.verify(parsed.data) : [];
      if (problems.length > 0) return { index, ok: false, value: parsed.data, issues: problems, usage: res.usage, costUsd: cost, durationMs: Date.now() - t0, promptHash: hash };
      return { index, ok: true, value: parsed.data, usage: res.usage, costUsd: cost, durationMs: Date.now() - t0, promptHash: hash };
    } catch (e) {
      return { index, ok: false, issues: [`provider error: ${(e as Error).message}`], usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, durationMs: Date.now() - t0, promptHash: hash };
    }
  };

  let batch = await Promise.all(Array.from({ length: k }, (_, i) => attempt(i, opts.prompt)));
  samples.push(...batch);
  for (let round = 0; round < rounds && !batch.some((s) => s.ok); round++) {
    // Repair: the error digest goes into the prompt; the failed output itself is scrubbed (context hygiene).
    batch = await Promise.all(
      batch.map((s, i) => attempt(samples.length + i, `${opts.prompt}\n\nYour previous attempt was rejected for these reasons; produce a corrected artifact:\n- ${(s.issues ?? []).slice(0, 12).join('\n- ')}`)),
    );
    samples.push(...batch);
  }
  const accepted = samples.filter((s) => s.ok && s.value !== undefined);
  let selected: Sample<T> | null = accepted[0] ?? null;
  if (opts.score && accepted.length > 1) {
    selected = accepted.map((s) => ({ s, score: opts.score!(s.value as T) })).sort((a, b) => b.score - a.score)[0]?.s ?? null;
  }
  return { selected, samples, totalCostUsd: total };
}
