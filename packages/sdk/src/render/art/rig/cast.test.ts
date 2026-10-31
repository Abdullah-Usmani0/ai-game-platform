import { describe, expect, it } from 'vitest';
import { artPalette } from '../palette.js';
import { legendFor, paintFrames } from '../sprites.js';
import { CAST_RECIPES } from './cast.js';

const pal = artPalette({ background: '#0d0a12', mid: '#3b3346', foreground: '#e8dcc8', accent: '#d9a441', danger: '#a3172a', ui: '#efe6d2' }, 'dark');

describe('the castle cast', () => {
  it('bakes into templates of slot letters only, every frame of a recipe the same size', () => {
    const letters = new Set(Object.keys(legendFor(pal)));
    // What is wrong, gathered and checked once: the boss alone is some 700k letters.
    const wrong = new Set<string>();
    for (const [name, recipe] of Object.entries(CAST_RECIPES)) {
      const first = Object.values(recipe.anims)[0]![0]!;
      for (const [anim, frames] of Object.entries(recipe.anims)) {
        for (const t of frames) {
          if (t.length !== first.length) wrong.add(`${name} ${anim}: ${t.length} rows, not ${first.length}`);
          for (const row of t) {
            if (row.length !== first[0]!.length) wrong.add(`${name} ${anim}: a row of ${row.length}, not ${first[0]!.length}`);
            for (const ch of row) if (ch !== '.' && !letters.has(ch)) wrong.add(`${name} ${anim}: '${ch}'`);
          }
        }
      }
    }
    expect([...wrong]).toEqual([]);
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
    expect(Object.keys(CAST_RECIPES.sentinel!.anims)).toEqual(['idle', 'walk', 'hurt', 'block', 'thrust']);
    expect(Object.keys(CAST_RECIPES.wraith!.anims)).toEqual(['idle', 'hurt', 'cast', 'fade']);
    expect(Object.keys(CAST_RECIPES['bone-archer']!.anims)).toEqual(['walk', 'hurt', 'draw']);
    // Each attack names the frames that hit, so a move draws its wind-up over its startup.
    expect([CAST_RECIPES.ghoul!.active, CAST_RECIPES.hound!.active, CAST_RECIPES.gargoyle!.active, CAST_RECIPES.sentinel!.active]).toEqual([{ claw: [2, 3] }, { pounce: [2, 3] }, { aim: [1] }, { thrust: [2, 3] }]);
    expect([CAST_RECIPES.wraith!.active, CAST_RECIPES['bone-archer']!.active]).toEqual([{ cast: [2], fade: [3] }, { draw: [4] }]);
    // The boss: a frame a pose, from its knee to its fury, and the wave its cleaver sends along the floor.
    const boss = CAST_RECIPES.headsman!;
    expect(Object.fromEntries(Object.entries(boss.anims).map(([k, v]) => [k, v.length]))).toEqual({ kneel: 1, walk: 4, rise: 6, chop: 5, leap: 5, drag: 5, roar: 3, combo: 6, hurt: 1 });
    expect(boss.active).toEqual({ rise: [2, 3], chop: [2, 3], leap: [2, 3], drag: [2], roar: [1], combo: [1, 2, 3, 4] });
    expect([boss.anims.kneel![0]![0]!.length, boss.anims.kneel![0]!.length]).toEqual([168, 112]);
    expect([CAST_RECIPES.wave!.anchor, Object.keys(CAST_RECIPES.wave!.anims)]).toEqual(['center', ['run']]);
    for (const recipe of Object.values(CAST_RECIPES)) {
      const a = paintFrames(recipe, pal);
      const b = paintFrames(recipe, pal);
      a.forEach((f, i) => expect(Buffer.from(f.pc.data).equals(Buffer.from(b[i]!.pc.data))).toBe(true));
    }
  });
});
