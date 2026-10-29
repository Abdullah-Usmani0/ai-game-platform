import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Store, TrainingPairRow } from '@gg/db';
import { ARTIFACT_SCHEMAS, toJsonSchema, type ArtifactName } from '@gg/schemas';

/**
 * Distillation exports: the worker's verified (input -> artifact) pairs as chat-format JSONL per stage, ready for a
 * LoRA run on a 7-30B model. One example per input, a train/holdout split that never moves an input between runs, no
 * content from games under moderation, and a manifest that ties every line back to its pair.
 */

/** Unique verified inputs a stage needs before a LoRA run on it is worth launching (the plan's 2-5k). */
export const READY_PAIRS = 2000;
export const DEFAULT_HOLDOUT = 0.1;

/** Game states whose content must not train a model: under review or taken down by moderation. */
const MODERATED = new Set(['suspended', 'removed']);

export interface ChatExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

/** What the student sees at inference (the stage's system prompt and prompt), then the verified artifact. */
export function toChat(p: TrainingPairRow): ChatExample {
  return {
    messages: [
      { role: 'system', content: p.input.system },
      { role: 'user', content: p.input.prompt },
      { role: 'assistant', content: typeof p.output === 'string' ? p.output : JSON.stringify(p.output) },
    ],
  };
}

/**
 * The split follows the input alone, whatever else an export holds: an input in one run's holdout is in every run's
 * holdout, so a distilled model is never scored on an example it was trained on.
 */
export function splitOf(inputHash: string, holdout: number): 'train' | 'holdout' {
  return createHash('sha256').update(inputHash).digest().readUInt32BE(0) / 2 ** 32 < holdout ? 'holdout' : 'train';
}

export interface Dataset {
  stage: string;
  train: TrainingPairRow[];
  holdout: TrainingPairRow[];
  /** Unique inputs the stage has outside moderated games, exported or not (readiness counts these). */
  uniqueInputs: number;
  excluded: { duplicate: number; moderated: number; exportedBefore: number };
}

export interface BuildOptions {
  holdout?: number;
  /** Only inputs no earlier export included. */
  newOnly?: boolean;
  /** The current state of a pair's game (pairs of suspended or removed games are left out). */
  gameState?: (gameId: string) => string | undefined;
}

/** One stage's dataset: moderated games out, then one pair per input (the earliest), then the split. */
export function buildDataset(stage: string, pairs: readonly TrainingPairRow[], opts: BuildOptions = {}): Dataset {
  const holdout = opts.holdout ?? DEFAULT_HOLDOUT;
  const ordered = pairs.filter((p) => p.stage === stage).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const exportedInputs = new Set(ordered.filter((p) => p.exportedAt !== null).map((p) => p.inputHash));
  const ds: Dataset = { stage, train: [], holdout: [], uniqueInputs: 0, excluded: { duplicate: 0, moderated: 0, exportedBefore: 0 } };
  const seen = new Set<string>();
  for (const p of ordered) {
    const state = p.gameId ? opts.gameState?.(p.gameId) : undefined;
    if (state && MODERATED.has(state)) {
      ds.excluded.moderated++;
      continue;
    }
    if (seen.has(p.inputHash)) {
      ds.excluded.duplicate++;
      continue;
    }
    seen.add(p.inputHash);
    if (opts.newOnly && exportedInputs.has(p.inputHash)) {
      ds.excluded.exportedBefore++;
      continue;
    }
    ds[splitOf(p.inputHash, holdout)].push(p);
  }
  ds.uniqueInputs = seen.size;
  return ds;
}

interface FileInfo {
  path: string;
  examples: number;
  bytes: number;
  sha256: string;
  pairIds: string[];
}

export interface Manifest {
  version: 1;
  stage: string;
  exportedAt: string;
  holdoutFraction: number;
  newOnly: boolean;
  files: { train: FileInfo; holdout: FileInfo };
  excluded: Dataset['excluded'];
  artifacts: Record<string, number>;
  genres: Record<string, number>;
  models: Record<string, number>;
  policyVersions: number[];
  /** JSON Schemas of the stage's schema artifacts: the distilled model serves the stage under the same constraint. */
  schemas: Record<string, Record<string, unknown>>;
  readiness: { uniqueInputs: number; needed: number; ready: boolean };
}

function writeJsonl(path: string, pairs: readonly TrainingPairRow[]): FileInfo {
  const text = pairs.map((p) => JSON.stringify(toChat(p))).join('\n') + (pairs.length ? '\n' : '');
  writeFileSync(path, text);
  return { path, examples: pairs.length, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), pairIds: pairs.map((p) => p.id) };
}

function tally(pairs: readonly TrainingPairRow[], key: (p: TrainingPairRow) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pairs) out[key(p)] = (out[key(p)] ?? 0) + 1;
  return out;
}

export interface ExportOptions {
  outDir: string;
  /** Default: every stage that has pairs. */
  stages?: string[];
  holdout?: number;
  newOnly?: boolean;
  /** Write the files but do not stamp the pairs as exported. */
  dryRun?: boolean;
  now?: Date;
}

/** Writes <outDir>/<stage>/{train,holdout}.jsonl and manifest.json per stage, then stamps the exported pairs. */
export async function exportDatasets(store: Store, opts: ExportOptions): Promise<Manifest[]> {
  const holdout = opts.holdout ?? DEFAULT_HOLDOUT;
  if (!(holdout >= 0 && holdout <= 0.5)) throw new Error(`holdout must be between 0 and 0.5, got ${holdout}`);
  const pairs = await store.listTrainingPairs();
  const states = new Map<string, string | undefined>();
  for (const id of new Set(pairs.flatMap((p) => (p.gameId ? [p.gameId] : [])))) states.set(id, (await store.getGame(id))?.state);
  const stages = opts.stages?.length ? opts.stages : [...new Set(pairs.map((p) => p.stage))].sort();
  const exportedAt = (opts.now ?? new Date()).toISOString();
  const manifests: Manifest[] = [];
  for (const stage of stages) {
    const ds = buildDataset(stage, pairs, { holdout, newOnly: opts.newOnly, gameState: (id) => states.get(id) });
    const dir = join(opts.outDir, stage);
    mkdirSync(dir, { recursive: true });
    const included = [...ds.train, ...ds.holdout];
    const artifacts = tally(included, (p) => p.artifact);
    const manifest: Manifest = {
      version: 1,
      stage,
      exportedAt,
      holdoutFraction: holdout,
      newOnly: Boolean(opts.newOnly),
      files: { train: writeJsonl(join(dir, 'train.jsonl'), ds.train), holdout: writeJsonl(join(dir, 'holdout.jsonl'), ds.holdout) },
      excluded: ds.excluded,
      artifacts,
      genres: tally(included, (p) => p.genre ?? 'unknown'),
      models: tally(included, (p) => p.model),
      policyVersions: [...new Set(included.flatMap((p) => (p.policyVersion === null ? [] : [p.policyVersion])))].sort((a, b) => a - b),
      schemas: Object.fromEntries(Object.keys(artifacts).filter((a) => a in ARTIFACT_SCHEMAS).map((a) => [a, toJsonSchema(a as ArtifactName)])),
      readiness: { uniqueInputs: ds.uniqueInputs, needed: READY_PAIRS, ready: ds.uniqueInputs >= READY_PAIRS },
    };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (!opts.dryRun && included.length > 0) await store.markTrainingPairsExported(included.map((p) => p.id), exportedAt);
    manifests.push(manifest);
  }
  return manifests;
}

export interface StageStatus {
  stage: string;
  pairs: number;
  uniqueInputs: number;
  notExported: number;
  moderated: number;
  ready: boolean;
}

/** Per stage: recorded pairs, unique inputs outside moderated games, how many no export included yet, and readiness. */
export async function stageStatus(store: Store): Promise<StageStatus[]> {
  const pairs = await store.listTrainingPairs();
  const states = new Map<string, string | undefined>();
  for (const id of new Set(pairs.flatMap((p) => (p.gameId ? [p.gameId] : [])))) states.set(id, (await store.getGame(id))?.state);
  return [...new Set(pairs.map((p) => p.stage))].sort().map((stage) => {
    const all = buildDataset(stage, pairs, { gameState: (id) => states.get(id) });
    const fresh = buildDataset(stage, pairs, { newOnly: true, gameState: (id) => states.get(id) });
    return { stage, pairs: pairs.filter((p) => p.stage === stage).length, uniqueInputs: all.uniqueInputs, notExported: fresh.train.length + fresh.holdout.length, moderated: all.excluded.moderated, ready: all.uniqueInputs >= READY_PAIRS };
  });
}
