import type { Genre } from '@gg/schemas';
import { buildCatalog, type GenreManifest } from '@gg/template-core';
import { platformer } from '@gg/template-platformer/node';
import { survivors } from '@gg/template-survivors/node';
import { shmup } from '@gg/template-shmup/node';
import { topdownAction } from '@gg/template-topdown-action/node';

/** The ONLY shared edit when adding a genre. */
export const GENRES: Record<string, GenreManifest> = { platformer, survivors, 'topdown-action': topdownAction, shmup };

export function genre(id: string): GenreManifest {
  const g = GENRES[id];
  if (!g) throw new Error(`unknown genre '${id}' (known: ${Object.keys(GENRES).join(', ')})`);
  return g;
}

export const CATALOG = buildCatalog(Object.values(GENRES));
export const GENRE_IDS = Object.keys(GENRES) as Genre[];
export * from '@gg/template-core';
