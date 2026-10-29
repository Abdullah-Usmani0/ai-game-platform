import { describe, expect, it } from 'vitest';
import { quarantinePath } from './ranking';
import { SupabaseStore } from './supabase-store';

/** Buckets in memory that list like Supabase Storage: one folder level per call, folders with a null id. */
function memoryStorage(initial: Record<string, string[]>) {
  const buckets = new Map(Object.entries(initial).map(([name, paths]) => [name, new Set(paths)]));
  const purged: string[] = [];
  const bucket = (name: string) => {
    if (!buckets.has(name)) buckets.set(name, new Set());
    return buckets.get(name)!;
  };
  const from = (name: string) => ({
    async list(dir: string, opts: { limit: number; offset: number }) {
      const entries = new Map<string, boolean>();
      for (const f of bucket(name)) {
        if (!f.startsWith(`${dir}/`)) continue;
        const [entry, ...rest] = f.slice(dir.length + 1).split('/');
        entries.set(entry!, rest.length > 0 || entries.get(entry!) === true);
      }
      const page = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(opts.offset, opts.offset + opts.limit);
      return { data: page.map(([entry, folder]) => ({ name: entry, id: folder ? null : `id:${entry}` })), error: null };
    },
    async copy(fromPath: string, toPath: string, opts: { destinationBucket?: string } = {}) {
      if (!bucket(name).has(fromPath)) return { data: null, error: { message: `no ${fromPath}` } };
      bucket(opts.destinationBucket ?? name).add(toPath);
      return { data: { path: toPath }, error: null };
    },
    async remove(batch: string[]) {
      expect(batch.length).toBeLessThanOrEqual(1000);
      for (const b of batch) bucket(name).delete(b);
      return { data: [], error: null };
    },
    async purgeCache(path: string) {
      purged.push(`${name}/${path}`);
      return { data: null, error: { message: 'CDN purge is a hosted feature' } };
    },
  });
  return { buckets, purged, storage: { from } };
}

function storeWith(client: unknown): SupabaseStore {
  const store = new SupabaseStore('http://127.0.0.1:54321', 'service-role-key');
  return Object.assign(store, { client });
}

/** A query builder that resolves to fixed rows (the part of PostgREST the moderation methods use). */
function rows(data: unknown) {
  const q = { select: () => q, eq: () => q, order: () => q, single: async () => ({ data: Array.isArray(data) ? data[0] : data, error: null }), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok) };
  return q;
}

describe('SupabaseStore takedowns', () => {
  const assets = Array.from({ length: 1200 }, (_, i) => `g/game-1/v/1/assets/a${String(i).padStart(4, '0')}.png`);

  it('moves every object under a folder to another bucket across pages and nested folders, leaving other games alone', async () => {
    const mem = memoryStorage({ bundles: [...assets, 'g/game-1/v/1/index.html', 'g/game-1/v/2/game.js', 'g/game-10/v/1/index.html', 'g/game-2/v/1/index.html'] });
    const store = storeWith({ storage: mem.storage });
    const moved = await store.moveFolder('bundles', 'g/game-1', 'checkpoints', 'takedowns/r1/g/game-1');
    expect(moved).toHaveLength(1202);
    expect([...mem.buckets.get('bundles')!].sort()).toEqual(['g/game-10/v/1/index.html', 'g/game-2/v/1/index.html']);
    expect(mem.buckets.get('checkpoints')!.has('takedowns/r1/g/game-1/v/2/game.js')).toBe(true);
    expect(mem.purged).toHaveLength(1202);
  });

  it('quarantines a removed game and restores its files when an appeal reinstates it', async () => {
    const mem = memoryStorage({ bundles: ['g/game-1/v/1/index.html', 'g/game-1/v/1/game.js'] });
    const report = { id: 'r1', game_id: 'game-1', kind: 'ip', status: 'resolved', resolution: 'remove' };
    const appeal = { id: 'a1', takedown_id: 't1', game_id: 'game-1', status: 'reinstated' };
    const takedown = { id: 't1', game_id: 'game-1', report_id: 'r1', action: 'removed', reverted_at: '2026-11-12T00:00:00Z' };
    const rpc = async (fn: string) => ({ data: fn === 'resolve_report' ? report : appeal, error: null });
    const game = { id: 'game-1', state: 'playable' };
    const store = storeWith({ rpc, storage: mem.storage, from: (table: string) => rows(table === 'games' ? game : [takedown]) });
    Object.assign(store, { getGame: async () => game });
    await store.resolveReport('r1', 'moderator', { resolution: 'remove', note: '' });
    expect(mem.buckets.get('bundles')!.size).toBe(0);
    expect([...mem.buckets.get('checkpoints')!].sort()).toEqual([`${quarantinePath('r1', 'game-1')}/v/1/game.js`, `${quarantinePath('r1', 'game-1')}/v/1/index.html`]);
    const { games } = await store.decideAppeal('a1', 'moderator', { decision: 'reinstate', note: '' });
    expect(games.map((g) => g.id)).toEqual(['game-1']);
    expect([...mem.buckets.get('bundles')!].sort()).toEqual(['g/game-1/v/1/game.js', 'g/game-1/v/1/index.html']);
    expect(mem.buckets.get('checkpoints')!.size).toBe(0);
  });

  it('says the takedown is recorded when moving the files fails after resolve_report', async () => {
    const report = { id: 'r1', game_id: 'game-1', kind: 'ip', status: 'resolved', resolution: 'remove' };
    const failing = { list: async () => ({ data: null, error: { message: 'storage unavailable' } }) };
    const store = storeWith({ rpc: async () => ({ data: report, error: null }), storage: { from: () => failing } });
    await expect(store.resolveReport('r1', 'moderator', { resolution: 'remove', note: '' })).rejects.toThrow(/takedown is recorded.*bundles\/g\/game-1\/.*storage unavailable/);
  });
});
