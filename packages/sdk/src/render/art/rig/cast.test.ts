import { describe, expect, it } from 'vitest';
import { artPalette } from '../palette.js';
import { legendFor, paintFrames } from '../sprites.js';
import { CAST_RECIPES } from './cast.js';

const pal = artPalette({ background: '#0d0a12', mid: '#3b3346', foreground: '#e8dcc8', accent: '#d9a441', danger: '#a3172a', ui: '#efe6d2' }, 'dark');

describe('the castle cast', () => {
  it('bakes into templates of slot letters only, every frame of a recipe the same size', () => {
    const letters = new Set(Object.keys(legendFor(pal)));
    for (const [name, recipe] of Object.entries(CAST_RECIPES)) {
      const first = Object.values(recipe.anims)[0]![0]!;
      for (const [anim, frames] of Object.entries(recipe.anims)) {
        for (const t of frames) {
          expect(t.length, `${name} ${anim}`).toBe(first.length);
          for (const row of t) {
            expect(row.length, `${name} ${anim}`).toBe(first[0]!.length);
            for (const ch of row) if (ch !== '.') expect(letters.has(ch), `${name} ${anim}: '${ch}'`).toBe(true);
          }
        }
      }
    }
  });

  it('stands every frame on the ground on its last row, the leap and the pounce in flight aside', () => {
    for (const [name, recipe] of Object.entries(CAST_RECIPES)) {
      if (recipe.anchor !== 'feet') continue;
      for (const [anim, frames] of Object.entries(recipe.anims)) {
        if (anim === 'jump') continue;
        const flight = anim === 'pounce' ? (recipe.active?.[anim] ?? []) : [];
        frames.forEach((t, i) => flight.includes(i) || expect(/[^.]/.test(t.at(-1)!), `${name} ${anim} ${i} floats`).toBe(true));
      }
    }
  });

  it('has the animations its behaviours play, and paints the same pixels every time', () => {
    expect(Object.keys(CAST_RECIPES.ghoul!.anims)).toEqual(['walk', 'run', 'hurt', 'claw']);
    expect(Object.keys(CAST_RECIPES.hound!.anims)).toEqual(['idle', 'run', 'jump', 'hurt', 'pounce']);
    expect(Object.keys(CAST_RECIPES.gargoyle!.anims)).toEqual(['idle', 'aim', 'hurt']);
    // Each attack names the frames that hit, so a move draws its wind-up over its startup.
    expect([CAST_RECIPES.ghoul!.active, CAST_RECIPES.hound!.active, CAST_RECIPES.gargoyle!.active]).toEqual([{ claw: [2, 3] }, { pounce: [2, 3] }, { aim: [1] }]);
    for (const recipe of Object.values(CAST_RECIPES)) {
      const a = paintFrames(recipe, pal);
      const b = paintFrames(recipe, pal);
      a.forEach((f, i) => expect(Buffer.from(f.pc.data).equals(Buffer.from(b[i]!.pc.data))).toBe(true));
    }
  });
});
