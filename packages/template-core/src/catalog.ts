import type { CatalogSystem, SystemsCatalog } from '@gg/validators';
import type { GenreRuntime } from './manifest.js';

/** Merge every genre's system metadata into the catalog the systems-select skill and checkSystems use. */
export function buildCatalog(genres: GenreRuntime[]): SystemsCatalog {
  const out: SystemsCatalog = {};
  for (const g of genres) {
    for (const [id, mod] of Object.entries(g.systems)) {
      const existing = out[id];
      if (existing) {
        if (existing.genres !== '*') existing.genres = [...new Set([...existing.genres, ...(mod.meta.genres === '*' ? [] : mod.meta.genres)])];
        continue;
      }
      const meta: CatalogSystem = { ...mod.meta, params: { ...mod.meta.params } };
      out[id] = meta;
    }
  }
  return out;
}
