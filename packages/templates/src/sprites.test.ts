import { SpriteSheet } from '@gg/schemas';
import { artPalette, type OutlineMode, type PaletteRoles } from '@gg/sdk/art';
import { EXAMPLES } from '@gg/template-freeform';
import { checkSpriteSheet } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { GENRES } from './genres.js';
import { castOf } from './resolve.js';

/** The sample games' palettes, by genre. */
const PALETTES: Record<string, PaletteRoles> = {
  platformer: { background: '#1b1b2f', mid: '#4f5d75', foreground: '#f2f2f2', accent: '#ffd166', danger: '#ef476f', ui: '#ffffff' },
  survivors: { background: '#14101c', mid: '#3d3550', foreground: '#f6f1d1', accent: '#8bd3dd', danger: '#f26b5b', ui: '#ffffff' },
  'topdown-action': { background: '#1a1210', mid: '#4a3328', foreground: '#f5e6c8', accent: '#ff9f43', danger: '#e63946', ui: '#ffffff' },
  shmup: { background: '#0b1026', mid: '#263a6b', foreground: '#eaf2ff', accent: '#5ee0ff', danger: '#ff4d6d', ui: '#ffffff' },
  metroidvania: { background: '#0d0b16', mid: '#3b3552', foreground: '#f2e9d8', accent: '#ffc857', danger: '#e4572e', ui: '#9ad1d4' },
  puzzle: { background: '#17130f', mid: '#5a4632', foreground: '#f3e3c3', accent: '#d9822b', danger: '#c0392b', ui: '#7bd389' },
  lifesim: { background: '#1d2b1f', mid: '#6b8e4e', foreground: '#f2d7b6', accent: '#f0b84a', danger: '#d9534f', ui: '#f5eedc' },
};
const OUTLINES: OutlineMode[] = ['dark', 'none'];

describe('sprite designs', () => {
  it("passes every curated genre's cast drawn as it ships, its hostiles held against its player", () => {
    for (const id of Object.keys(GENRES)) {
      const cast = castOf({}, id);
      expect(cast[0], id).toMatchObject({ type: '@player', role: 'player' });
      expect(cast.length, id).toBeGreaterThan(2);
      const asShipped = SpriteSheet.parse({ version: 1, sprites: cast.map((c) => ({ type: c.type, base: c.recipe })) });
      for (const outline of OUTLINES) expect(checkSpriteSheet(asShipped, { pal: artPalette(PALETTES[id]!, outline), types: cast }).issues, `${id} ${outline}`).toEqual([]);
    }
  });

  it("passes each example game's designs in its own game, in every sample palette", () => {
    for (const ex of EXAMPLES) {
      const sheet = SpriteSheet.parse(ex.content?.['sprites']);
      const cast = castOf({ systems: ex.systems, roster: ex.roster, gdd: ex.gdd });
      expect(sheet.sprites.map((d) => d.type).filter((t) => !cast.some((c) => c.type === t)), ex.id).toEqual([]);
      for (const [name, roles] of Object.entries(PALETTES)) {
        for (const outline of OUTLINES) expect(checkSpriteSheet(sheet, { pal: artPalette(roles, outline), types: cast }).issues, `${ex.id} in ${name} ${outline}`).toEqual([]);
      }
    }
  });
});
