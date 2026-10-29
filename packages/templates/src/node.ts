import type { Genre } from '@gg/schemas';
import { buildCatalog, type GenreManifest } from '@gg/template-core';
import { metroidvania } from '@gg/template-metroidvania/node';
import { platformer } from '@gg/template-platformer/node';
import { survivors } from '@gg/template-survivors/node';
import { shmup } from '@gg/template-shmup/node';
import { topdownAction } from '@gg/template-topdown-action/node';

/** Adding a genre: one entry here and one in ./check.ts, plus the package in the templates, game-base and web dependency lists. */
export const GENRES: Record<string, GenreManifest> = { platformer, survivors, 'topdown-action': topdownAction, shmup, metroidvania };

export function genre(id: string): GenreManifest {
  const g = GENRES[id];
  if (!g) throw new Error(`unknown genre '${id}' (known: ${Object.keys(GENRES).join(', ')})`);
  return g;
}

export const CATALOG = buildCatalog(Object.values(GENRES));
export const GENRE_IDS = Object.keys(GENRES) as Genre[];
export * from '@gg/template-core';
