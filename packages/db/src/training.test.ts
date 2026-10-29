import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FileStore } from './file-store';
import { SupabaseStore } from './supabase-store';
import type { NewTrainingPair } from './types';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function fileStore(): FileStore {
  const dir = mkdtempSync(join(tmpdir(), 'gg-training-'));
  dirs.push(dir);
  return new FileStore(dir);
}

const pair = (over: Partial<NewTrainingPair> = {}): NewTrainingPair => ({
  stage: 'systems',
  genre: 'platformer',
  artifact: 'SystemsJson',
  input: { system: 'You select catalog systems.', prompt: 'GDD front matter: {}' },
  output: { version: 1 },
  inputHash: 'h1',
  model: 'claude-sonnet-5-5',
  provider: 'anthropic',
  jobId: 'j1',
  gameId: 'g1',
  contributors: ['maker'],
  verifiedBy: 'trajectories/g/g1/j/j1/systems-1-gate.json',
  policyVersion: 1,
  ...over,
});

describe('FileStore training pairs', () => {
  it('records pairs, lists them oldest first by stage and export state, and stamps the first export only', async () => {
    const store = fileStore();
    const a = await store.insertTrainingPair(pair());
    const b = await store.insertTrainingPair(pair({ stage: 'behaviour', artifact: 'BehaviourFsm', inputHash: 'h2', contributors: ['maker', 'maker'] }));
    expect(a?.exportedAt).toBeNull();
    expect(b?.contributors).toEqual(['maker']);
    expect((await store.listTrainingPairs()).map((p) => p.id)).toEqual([a!.id, b!.id]);
    expect((await store.listTrainingPairs({ stage: 'behaviour' })).map((p) => p.id)).toEqual([b!.id]);
    expect(await store.markTrainingPairsExported([a!.id], '2026-11-01T00:00:00.000Z')).toBe(1);
    expect(await store.markTrainingPairsExported([a!.id, b!.id], '2026-12-01T00:00:00.000Z')).toBe(1);
    expect((await store.listTrainingPairs({ exported: true })).map((p) => [p.id, p.exportedAt])).toEqual([
      [a!.id, '2026-11-01T00:00:00.000Z'],
      [b!.id, '2026-12-01T00:00:00.000Z'],
    ]);
    expect(await store.listTrainingPairs({ exported: false })).toEqual([]);
  });

  it('pairs recorded in the same millisecond keep the order they were recorded in', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T00:00:00Z') });
    try {
      const store = fileStore();
      const ids: string[] = [];
      for (let i = 0; i < 20; i++) ids.push((await store.insertTrainingPair(pair({ inputHash: `same-ms-${i}` })))!.id);
      expect((await store.listTrainingPairs()).map((p) => p.id)).toEqual(ids);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opting out deletes every pair the user is in and keeps new ones out until they opt back in', async () => {
    const store = fileStore();
    await store.insertTrainingPair(pair({ contributors: ['maker', 'remixer'] }));
    await store.insertTrainingPair(pair({ contributors: ['maker'] }));
    await store.setTrainingOptOut('remixer', true);
    expect(await store.trainingOptOut('remixer')).toBe(true);
    expect((await store.listTrainingPairs()).map((p) => p.contributors)).toEqual([['maker']]);
    expect(await store.insertTrainingPair(pair({ contributors: ['remixer'] }))).toBeNull();
    await store.setTrainingOptOut('remixer', false);
    expect(await store.trainingOptOut('remixer')).toBe(false);
    expect(await store.insertTrainingPair(pair({ contributors: ['remixer'] }))).not.toBeNull();
    // A second store on the same directory reads what the first wrote.
    expect(await new FileStore(dirs[dirs.length - 1]!).listTrainingPairs()).toHaveLength(2);
  });
});

describe('SupabaseStore training pairs', () => {
  function storeWith(client: unknown): SupabaseStore {
    return Object.assign(new SupabaseStore('http://127.0.0.1:54321', 'service-role-key'), { client });
  }

  it('inserts snake_case columns and returns null when the consent trigger drops the row', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    let drop = false;
    const client = {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          expect(table).toBe('training_pairs');
          inserted.push(row);
          return { select: async () => ({ data: drop ? [] : [{ ...row, id: 'p1', output_path: null, exported_at: null, created_at: '2026-11-01T00:00:00Z' }], error: null }) };
        },
      }),
    };
    const store = storeWith(client);
    const row = await store.insertTrainingPair(pair({ contributors: ['u1', 'u1', 'u2'] }));
    expect(inserted[0]).toMatchObject({ input_hash: 'h1', job_id: 'j1', game_id: 'g1', verified_by: 'trajectories/g/g1/j/j1/systems-1-gate.json', policy_version: 1, contributors: ['u1', 'u2'] });
    expect(row).toMatchObject({ id: 'p1', inputHash: 'h1', jobId: 'j1', exportedAt: null, contributors: ['u1', 'u2'] });
    expect(row).not.toHaveProperty('outputPath');
    drop = true;
    expect(await store.insertTrainingPair(pair())).toBeNull();
  });

  it('pages through every pair (PostgREST returns 1000 rows at most) and stamps exports in batches', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: `p${i}`, stage: 'systems', exported_at: null, created_at: `2026-11-01T00:00:${String(i % 60).padStart(2, '0')}Z` }));
    const ranges: Array<[number, number]> = [];
    const updates: number[] = [];
    const query = () => {
      const q = {
        eq: () => q,
        is: () => q,
        not: () => q,
        order: () => q,
        range: async (from: number, to: number) => {
          ranges.push([from, to]);
          return { data: all.slice(from, to + 1), error: null };
        },
      };
      return q;
    };
    const client = {
      from: () => ({
        select: query,
        update: () => ({ in: (_: string, ids: string[]) => ({ is: () => ({ select: async () => (updates.push(ids.length), { data: ids.map((id) => ({ id })), error: null }) }) }) }),
      }),
    };
    const store = storeWith(client);
    expect(await store.listTrainingPairs({ stage: 'systems' })).toHaveLength(2500);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(await store.listTrainingPairs({ limit: 1500 })).toHaveLength(1500);
    expect(await store.markTrainingPairsExported(all.slice(0, 250).map((p) => p.id))).toBe(250);
    expect(updates).toEqual([100, 100, 50]);
  });
});
