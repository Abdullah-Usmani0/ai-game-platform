import { describe, expect, it } from 'vitest';
import { HEADINGS, PixelCanvas, RECIPES, artPalette, headingFrame, legendFor, paintFrames, paintTurns, playerRecipe, settingFor, turnFrameSize, turnSprite, vehicleRecipe, type PaletteRoles } from './index.js';

const ROLES: Record<string, PaletteRoles> = {
  survivors: { background: '#14101c', mid: '#3d3550', foreground: '#f6f1d1', accent: '#8bd3dd', danger: '#f26b5b', ui: '#ffffff' },
  topdown: { background: '#1a1210', mid: '#4a3328', foreground: '#f5e6c8', accent: '#ff9f43', danger: '#e63946', ui: '#ffffff' },
  daylight: { background: '#79b4ff', mid: '#6b4b2a', foreground: '#f6f1e6', accent: '#ffd966', danger: '#e04b4b', ui: '#e9e3d3' },
  mono: { background: '#000000', mid: '#3a3a3a', foreground: '#ffffff', accent: '#ffff00', danger: '#ff0000', ui: '#ffffff' },
};

const painted = (pc: PixelCanvas): number => {
  let n = 0;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y) > 0) n++;
  return n;
};
const colours = (pc: PixelCanvas): Set<string> => {
  const out = new Set<string>();
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y) > 0) out.add(pc.get(x, y).join(','));
  return out;
};
const TURNING = Object.entries(RECIPES).filter(([, r]) => r.turns === true);

describe('turning sprites', () => {
  it('picks the nearest of sixteen headings, east first and clockwise as y runs down', () => {
    expect([0, 11, 12, 90, 180, 270, 359, -22.5, 720].map(headingFrame)).toEqual([0, 0, 1, 4, 8, 12, 0, 15, 0]);
    expect(HEADINGS).toBe(16);
  });

  it('turns a bar a quarter of the way round into a column, its colour its own and its line one pixel wide', () => {
    const bar = new PixelCanvas(9, 1);
    for (let x = 0; x < 9; x++) bar.set(x, 0, [200, 40, 40]);
    const size = 11;
    const east = turnSprite(bar, 0, size);
    const south = turnSprite(bar, 90, size);
    expect(painted(east)).toBe(9);
    expect(painted(south)).toBe(9);
    const columns = new Set<number>();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (south.alpha(x, y) > 0) columns.add(x);
    expect(columns.size).toBe(1);
    expect([...colours(south)]).toEqual(['200,40,40']);
  });

  it('every vehicle turns to all sixteen headings in every palette, as much of it as it is facing east, in its own colours', () => {
    expect(TURNING.map(([n]) => n).sort()).toEqual(['sloop', 'vehicle-bike', 'vehicle-boat', 'vehicle-car', 'vehicle-galleon']);
    for (const roles of Object.values(ROLES)) {
      const pal = artPalette(roles);
      for (const [name, recipe] of TURNING) {
        const turns = paintTurns(recipe, pal);
        const frames = Object.values(recipe.anims).reduce((n, f) => n + f.length, 0);
        expect(turns.length, name).toBe(frames * HEADINGS);
        const size = turnFrameSize(recipe);
        const legend = legendFor(pal, recipe.tune?.(pal));
        for (const t of turns) {
          expect([t.pc.w, t.pc.h], name).toEqual([size, size]);
          // The east frame painted the plain way (outline and all) is the measure for every heading.
          const east = paintFrames({ ...recipe, anims: { [t.anim]: [recipe.anims[t.anim]![t.frame]!] } }, pal)[0]!.pc;
          const ratio = painted(t.pc) / painted(east);
          expect(ratio, `${name} ${t.anim}:${t.frame} heading ${t.heading}`).toBeGreaterThan(0.8);
          expect(ratio, `${name} ${t.anim}:${t.frame} heading ${t.heading}`).toBeLessThan(1.3);
          // Nothing but the template's own colours and the outline: a turn invents no colour.
          const own = new Set([...colours(east), ...Object.values(legend).flatMap((c) => (c ? [c.join(',')] : []))]);
          for (const c of colours(t.pc)) expect(own.has(c), `${name} heading ${t.heading} colour ${c}`).toBe(true);
        }
      }
    }
  });

  it('draws a player that drives as its vehicle, and one that sails at sea', () => {
    expect(['bike', 'car', 'boat', 'galleon'].map((k) => playerRecipe('field', 8, k))).toEqual(['vehicle-bike', 'vehicle-car', 'vehicle-boat', 'vehicle-galleon']);
    expect(playerRecipe('field', 8)).toBe('hero-topdown');
    expect(vehicleRecipe('hovercraft')).toBeUndefined();
    expect([settingFor('survivors', 'topdown', 'galleon'), settingFor('survivors', 'topdown', 'boat'), settingFor('survivors', 'topdown', 'bike'), settingFor('topdown-action', 'topdown', 'car')]).toEqual(['sea', 'sea', 'field', 'dungeon']);
  });
});
