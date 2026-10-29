import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore, type NewTrainingPair, type TrainingPairRow } from '@gg/db';
import { afterAll, describe, expect, it } from 'vitest';
import { buildDataset, exportDatasets, splitOf, stageStatus, toChat, type ChatExample, type Manifest } from './index.js';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tempDir = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};

let n = 0;
const row = (over: Partial<TrainingPairRow> = {}): TrainingPairRow => {
  n++;
  return {
    id: `p${String(n).padStart(4, '0')}`,
    stage: 'systems',
    genre: 'platformer',
    artifact: 'SystemsJson',
    input: { system: 'You select catalog systems.', prompt: `GDD ${n}` },
    output: { version: 1, n },
    inputHash: `h${n}`,
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    jobId: 'j1',
    gameId: 'g1',
    contributors: ['maker'],
    verifiedBy: null,
    policyVersion: 1,
    exportedAt: null,
    createdAt: `2026-11-01T00:00:${String(n % 60).padStart(2, '0')}.000Z`,
    ...over,
  };
};

describe('buildDataset', () => {
  it('keeps the earliest pair per input, leaves out moderated games before deduplicating, and splits by input', () => {
    const first = row({ inputHash: 'same', createdAt: '2026-11-01T00:00:01.000Z' });
    const later = row({ inputHash: 'same', createdAt: '2026-11-02T00:00:00.000Z' });
    const removedFirst = row({ inputHash: 'shared', gameId: 'gone', createdAt: '2026-11-01T00:00:00.000Z' });
    const cleanLater = row({ inputHash: 'shared', createdAt: '2026-11-03T00:00:00.000Z' });
    const other = row({ stage: 'behaviour' });
    const ds = buildDataset('systems', [later, first, removedFirst, cleanLater, other], { gameState: (id) => (id === 'gone' ? 'removed' : 'playable') });
    const kept = [...ds.train, ...ds.holdout].map((p) => p.id).sort();
    expect(kept).toEqual([first.id, cleanLater.id].sort());
    expect(ds.excluded).toEqual({ duplicate: 1, moderated: 1, exportedBefore: 0 });
    expect(ds.uniqueInputs).toBe(2);
  });

  it('holds out about the fraction asked, and an input never changes split as the data grows', () => {
    const pairs = Array.from({ length: 2000 }, () => row());
    const small = buildDataset('systems', pairs.slice(0, 500), { holdout: 0.1 });
    const big = buildDataset('systems', pairs, { holdout: 0.1 });
    expect(big.holdout.length / 2000).toBeGreaterThan(0.08);
    expect(big.holdout.length / 2000).toBeLessThan(0.12);
    const bigHoldout = new Set(big.holdout.map((p) => p.id));
    for (const p of small.holdout) expect(bigHoldout.has(p.id)).toBe(true);
    for (const p of small.train) expect(bigHoldout.has(p.id)).toBe(false);
    expect(splitOf('h1', 0)).toBe('train');
    expect(buildDataset('systems', pairs.slice(0, 50), { holdout: 0 }).holdout).toEqual([]);
  });

  it('new-only leaves out inputs an earlier export included, even when recorded again', () => {
    const exported = row({ inputHash: 'old', exportedAt: '2026-11-05T00:00:00.000Z' });
    const again = row({ inputHash: 'old' });
    const fresh = row({ inputHash: 'new' });
    const ds = buildDataset('systems', [exported, again, fresh], { newOnly: true });
    expect([...ds.train, ...ds.holdout].map((p) => p.id)).toEqual([fresh.id]);
    expect(ds.excluded).toEqual({ duplicate: 1, moderated: 0, exportedBefore: 1 });
  });

  it('writes chat examples: the stage prompts, then the artifact as JSON or the text as is', () => {
    const json = toChat(row({ output: { version: 1, genre: 'platformer' } }));
    expect(json.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    expect(JSON.parse(json.messages[2]!.content)).toEqual({ version: 1, genre: 'platformer' });
    expect(toChat(row({ artifact: 'GddBody', output: '## Concept\nA mole.' })).messages[2]!.content).toBe('## Concept\nA mole.');
  });
});

describe('exportDatasets', () => {
  const pair = (over: Partial<NewTrainingPair> = {}): NewTrainingPair => {
    const { id: _id, exportedAt: _e, createdAt: _c, ...rest } = row();
    return { ...rest, ...over };
  };

  it('writes one directory per stage with a manifest that matches its files, and stamps what it exported', async () => {
    const store = new FileStore(tempDir('gg-distill-store-'));
    const game = await store.createGame({ ownerId: 'maker', slug: 'mole', title: 'Mole', genre: 'platformer' });
    const taken = await store.createGame({ ownerId: 'maker', slug: 'taken', title: 'Taken', genre: 'platformer' });
    await store.updateGame(taken.id, { state: 'removed' });
    for (let i = 0; i < 30; i++) await store.insertTrainingPair(pair({ gameId: game.id, inputHash: `s${i}`, input: { system: 'sys', prompt: `systems ${i}` } }));
    await store.insertTrainingPair(pair({ gameId: game.id, inputHash: 's0' }));
    await store.insertTrainingPair(pair({ gameId: taken.id, inputHash: 'x1' }));
    await store.insertTrainingPair(pair({ stage: 'gdd', artifact: 'GddBody', output: '## Concept\nA mole.', gameId: game.id, inputHash: 'b1' }));
    const out = tempDir('gg-distill-out-');
    const manifests = await exportDatasets(store, { outDir: out, holdout: 0.2, now: new Date('2026-11-10T00:00:00Z') });
    expect(manifests.map((m) => m.stage)).toEqual(['gdd', 'systems']);
    const systems = manifests[1]!;
    expect(systems.files.train.examples + systems.files.holdout.examples).toBe(30);
    expect(systems.excluded).toEqual({ duplicate: 1, moderated: 1, exportedBefore: 0 });
    expect(Object.keys(systems.schemas)).toEqual(['SystemsJson']);
    expect(manifests[0]!.schemas).toEqual({});
    expect(systems.readiness).toEqual({ uniqueInputs: 30, needed: 2000, ready: false });
    const onDisk = JSON.parse(readFileSync(join(out, 'systems', 'manifest.json'), 'utf8')) as Manifest;
    expect(onDisk.files.train.pairIds).toEqual(systems.files.train.pairIds);
    const trainText = readFileSync(join(out, 'systems', 'train.jsonl'), 'utf8');
    expect(createHash('sha256').update(trainText).digest('hex')).toBe(systems.files.train.sha256);
    const lines = trainText.trim().split('\n').map((l) => JSON.parse(l) as ChatExample);
    expect(lines).toHaveLength(systems.files.train.examples);
    expect(lines[0]!.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect((await store.listTrainingPairs({ exported: true })).every((p) => p.exportedAt === '2026-11-10T00:00:00.000Z')).toBe(true);
    expect(await store.listTrainingPairs({ exported: true })).toHaveLength(31);
    const status = await stageStatus(store);
    expect(status.find((s) => s.stage === 'systems')).toMatchObject({ pairs: 32, uniqueInputs: 30, notExported: 0, moderated: 1, ready: false });

    // A later new-only export takes only inputs recorded since; a dry run writes files but stamps nothing.
    await store.insertTrainingPair(pair({ gameId: game.id, inputHash: 's99' }));
    const dry = await exportDatasets(store, { outDir: out, stages: ['systems'], newOnly: true, dryRun: true });
    expect(dry[0]!.files.train.examples + dry[0]!.files.holdout.examples).toBe(1);
    expect(dry[0]!.excluded.exportedBefore).toBe(30);
    expect(await store.listTrainingPairs({ exported: false })).toHaveLength(3);
    await expect(exportDatasets(store, { outDir: out, holdout: 0.9 })).rejects.toThrow(/holdout/);
  });
});
