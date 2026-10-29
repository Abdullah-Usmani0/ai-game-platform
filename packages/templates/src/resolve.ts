import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityRoster, LevelProof, parseAnyGdd, parseSystemsFile, type AnyGddFrontmatter, type SystemsFile } from '@gg/schemas';
import type { GenreManifest } from '@gg/template-core';
import { FREEFORM_CATALOG, freeformDesignManifest, freeformManifest, IDENTITY_ROSTER } from '@gg/template-freeform/node';
import { parseFrontmatter, type SystemsCatalog } from '@gg/validators';
import { CATALOG, genre } from './genres.js';

/** What a game's design files say about it; a file that is missing or invalid is null (proofs: left out). */
export interface GameFiles {
  systems: SystemsFile | null;
  gdd: AnyGddFrontmatter | null;
  roster: EntityRoster | null;
  proofs: LevelProof[];
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Reads a game directory's design/systems.json, design/gdd.md front matter, content/entities.json and content/proofs/. */
export function readGameFiles(gameDir: string): GameFiles {
  const systems = parseSystemsFile(readJson(join(gameDir, 'design', 'systems.json')));
  const gddPath = join(gameDir, 'design', 'gdd.md');
  const fm = existsSync(gddPath) ? parseFrontmatter(readFileSync(gddPath, 'utf8')) : null;
  const gdd = fm ? parseAnyGdd(fm.data) : null;
  const roster = EntityRoster.safeParse(readJson(join(gameDir, 'content', 'entities.json')));
  const proofsDir = join(gameDir, 'content', 'proofs');
  const proofs = existsSync(proofsDir)
    ? readdirSync(proofsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .flatMap((f) => {
          const p = LevelProof.safeParse(readJson(join(proofsDir, f)));
          return p.success ? [p.data] : [];
        })
    : [];
  return { systems: systems.success ? systems.data : null, gdd: gdd?.success ? gdd.data : null, roster: roster.success ? roster.data : null, proofs };
}

/**
 * The manifest of a game: its curated genre's own, the very object the genre registry holds; or a freeform game's
 * composition on its base (its systems, roster and proofs), or before its systems are chosen, the base offering every
 * system that works with its movement. The request's genre is the last resort, for a game with no design files yet.
 */
export function manifestFor(files: Partial<GameFiles>, requestGenre?: string): GenreManifest {
  if (files.systems?.genre === 'freeform') return freeformManifest(files.systems, files.roster ?? IDENTITY_ROSTER, files.proofs ?? []);
  if (files.gdd?.genre === 'freeform') return freeformDesignManifest(files.gdd.base);
  const id = files.systems?.genre ?? files.gdd?.genre ?? requestGenre;
  if (!id) throw new Error('cannot determine the genre: no request, systems.json or gdd.md');
  if (id === 'freeform') throw new Error("a freeform game's base genre comes from its GDD, which is not written yet");
  return genre(id);
}

/** The manifest of the game in a directory (see manifestFor). */
export function resolveGame(gameDir: string, requestGenre?: string): GenreManifest {
  return manifestFor(readGameFiles(gameDir), requestGenre);
}

/** The catalog a game's systems.json is checked against: its genre's, or for a freeform game every system's. */
export function catalogFor(systems: Pick<SystemsFile, 'genre'>): SystemsCatalog {
  return systems.genre === 'freeform' ? FREEFORM_CATALOG : CATALOG;
}
