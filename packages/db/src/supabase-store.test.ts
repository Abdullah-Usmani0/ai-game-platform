import { describe, expect, it } from 'vitest';
import { SupabaseStore } from './supabase-store';

/** A bucket in memory that lists like Supabase Storage: one folder level per call, folders with a null id. */
function memoryBucket(paths: string[]) {
  const files = new Set(paths);
  const purged: string[] = [];
  const api = {
    async list(dir: string, opts: { limit: number; offset: number }) {
      const entries = new Map<string, boolean>();
      for (const f of files) {
        if (!f.startsWith(`${dir}/`)) continue;
        const [name, ...rest] = f.slice(dir.length + 1).split('/');
        entries.set(name!, rest.length > 0 || entries.get(name!) === true);
      }
      const page = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(opts.offset, opts.offset + opts.limit);
      return { data: page.map(([name, folder]) => ({ name, id: folder ? null : `id:${name}` })), error: null };
    },
    async remove(batch: string[]) {
      expect(batch.length).toBeLessThanOrEqual(1000);
      for (const b of batch) files.delete(b);
      return { data: [], error: null };
    },
    async purgeCache(path: string) {
      purged.push(path);
      return { data: null, error: { message: 'CDN purge is a hosted feature' } };
    },
  };
  return { files, purged, api };
}

function storeWith(client: unknown): SupabaseStore {
  const store = new SupabaseStore('http://127.0.0.1:54321', 'service-role-key');
  return Object.assign(store, { client });
}

describe('SupabaseStore takedown', () => {
  const assets = Array.from({ length: 1200 }, (_, i) => `g/game-1/v/1/assets/a${String(i).padStart(4, '0')}.png`);

  it('deletes every object under a folder across pages and nested folders, and leaves other games alone', async () => {
    const bucket = memoryBucket([...assets, 'g/game-1/v/1/index.html', 'g/game-1/v/2/game.js', 'g/game-10/v/1/index.html', 'g/game-2/v/1/index.html']);
    const store = storeWith({ storage: { from: (name: string) => (name === 'bundles' ? bucket.api : null) } });
    const removed = await store.removeFolder('bundles', 'g/game-1');
    expect(removed).toHaveLength(1202);
    expect([...bucket.files].sort()).toEqual(['g/game-10/v/1/index.html', 'g/game-2/v/1/index.html']);
    expect(bucket.purged).toHaveLength(1202);
  });

  it('says the takedown is recorded when deleting the files fails after resolve_report', async () => {
    const report = { id: 'r1', game_id: 'game-1', kind: 'ip', status: 'resolved', resolution: 'remove' };
    const failing = { list: async () => ({ data: null, error: { message: 'storage unavailable' } }) };
    const store = storeWith({ rpc: async () => ({ data: report, error: null }), storage: { from: () => failing } });
    await expect(store.resolveReport('r1', 'moderator', { resolution: 'remove', note: '' })).rejects.toThrow(/takedown is recorded.*bundles\/g\/game-1\/.*storage unavailable/);
  });
});
