import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEIST } from '@gg/template-freeform';
import { describe, expect, it } from 'vitest';
import { CHECKS, kitFor } from './check.js';
import { CATALOG, catalogFor, GENRES, manifestFor, readGameFiles, resolveGame } from './node.js';

const samples = fileURLToPath(new URL('../../../samples/', import.meta.url));

/** A game directory holding the given design and content files. */
function gameDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gg-resolve-'));
  for (const [rel, v] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), typeof v === 'string' ? v : JSON.stringify(v));
  }
  return dir;
}
const gddMd = (fm: unknown) => `---\n${JSON.stringify(fm)}\n---\n## Concept\nx\n`;

describe('resolveGame', () => {
  it('a curated game resolves to its genre, the very object the registry holds', () => {
    for (const id of Object.keys(GENRES)) expect(resolveGame(join(samples, id)), id).toBe(GENRES[id]);
    expect(manifestFor({}, 'shmup')).toBe(GENRES['shmup']);
    expect(catalogFor({ genre: 'shmup' })).toBe(CATALOG);
    expect(kitFor({ version: 1, genre: 'puzzle', feelPreset: 'grid-snappy', systems: [{ id: 'grid-push', params: {} }] })).toBe(CHECKS['puzzle']);
  });

  it('a freeform game resolves to its composition: before its systems, the base offering every usable system', () => {
    const designOnly = resolveGame(gameDir({ 'design/gdd.md': gddMd(HEIST.gdd) }));
    expect(designOnly.id).toBe('freeform');
    expect(designOnly.levelGrammar.kind).toBe('rooms');
    expect(Object.keys(designOnly.systems)).toEqual(expect.arrayContaining(['auto-attack', 'melee-attack', 'objectives']));
    const dir = gameDir({ 'design/gdd.md': gddMd(HEIST.gdd), 'design/systems.json': HEIST.systems, 'content/entities.json': HEIST.roster });
    const m = resolveGame(dir);
    expect(m.id).toBe('freeform');
    expect(Object.keys(m.systems)).toEqual(HEIST.systems.systems.map((s) => s.id));
    expect(m.entityDefs.map((d) => d.type)).toEqual(expect.arrayContaining(['guard', 'sentry', 'shard']));
    expect(m.composedParams).toEqual({ 'auto-attack': { dropType: 'shard' }, 'room-clear': { healType: 'cell' } });
    expect(m.solverBot).toBe('proof');
    expect(readGameFiles(dir).roster).toEqual(HEIST.roster);
    expect(catalogFor(HEIST.systems)['objectives']).toBeDefined();
    expect(kitFor(HEIST.systems, { roster: HEIST.roster }).runtime.entityDefs).toEqual(m.entityDefs);
  });

  it('says why when it cannot tell', () => {
    expect(() => manifestFor({})).toThrow(/cannot determine the genre/);
    expect(() => manifestFor({}, 'freeform')).toThrow(/base genre comes from its GDD/);
    expect(() => manifestFor({}, 'deckbuilder')).toThrow(/unknown genre/);
  });
});
