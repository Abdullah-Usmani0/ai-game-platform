import { SpriteDesign } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { artPalette, buildOf, compileSheet, compileSprite, frameSize, overlaid, paintDesignSheet, paintFrames, playerRecipe, rampsOf, RECIPES, spriteBases, spriteFor, type Recipe } from './index.js';

const pal = artPalette({ background: '#1d2b1f', mid: '#6b8e4e', foreground: '#f2d7b6', accent: '#f0b84a', danger: '#d9534f', ui: '#f5eedc' });
const design = (d: Record<string, unknown>) => SpriteDesign.parse(d);
const pixels = (r: Recipe) => paintFrames(r, pal).map((f) => [...f.pc.data].join(','));

describe('overlaid', () => {
  const t = ['....', '.AA.', '.AA.', '....'];

  it("paints its letters, keeps the base under '.', clears under '_'", () => {
    expect(overlaid(t, [design({ type: 'x', base: 'orb', overlays: [{ x: 1, y: 1, rows: ['k_'] }] }).overlays[0]!])).toEqual(['....', '.k..', '.AA.', '....']);
  });

  it('paints under the base only where it is clear, and is clipped to the frame', () => {
    const [o] = design({ type: 'x', base: 'orb', overlays: [{ x: 0, y: 1, rows: ['mmmmmm'], under: true }] }).overlays;
    expect(overlaid(t, [o!])).toEqual(['....', 'mAAm', '.AA.', '....']);
    const [low] = design({ type: 'x', base: 'orb', overlays: [{ x: 2, y: 3, rows: ['bb', 'bb'] }] }).overlays;
    expect(overlaid(t, [low!])).toEqual(['....', '.AA.', '.AA.', '..bb']);
  });

  it('moves down with the body when a frame bobs', () => {
    const [o] = design({ type: 'x', base: 'orb', overlays: [{ x: 1, y: 0, rows: ['k'] }] }).overlays;
    expect(overlaid(t, [o!], 1)).toEqual(['....', '.kA.', '.AA.', '....']);
  });
});

describe('compileSprite', () => {
  it('draws a design with no colours and no overlays exactly as its base, for every shipped sprite', () => {
    for (const [name, base] of Object.entries(RECIPES)) {
      const mine = compileSprite(design({ type: 'x', base: name }));
      expect(pixels(mine), name).toEqual(pixels(base));
      expect(frameSize(mine)).toEqual(frameSize(base));
    }
  });

  it("puts overlays on the animations they name, on every frame, and keeps the rest of the base's", () => {
    const farmer = RECIPES['farmer']!;
    const mine = compileSprite(design({ type: '@player', base: 'farmer', overlays: [{ anims: ['down-idle', 'down-run'], x: 0, y: 0, rows: ['_k____k_'] }] }));
    expect(mine.anims['up-idle']).toBe(farmer.anims['up-idle']);
    expect(mine.anims['down-idle']![0]![0]).toBe('.k....k.');
    expect(mine.anims['down-run']).toHaveLength(farmer.anims['down-run']!.length);
    // The farmer's run drops a row on its second frame: the antennae drop with the head.
    expect(farmer.anims['down-run']![1]![1]).toBe(farmer.anims['down-run']![0]![0]);
    expect(mine.anims['down-run']![1]![1]).toBe('.k....k.');
  });

  it("keeps an overlay on the head through a side-view run, which starts a row below the hero's rest", () => {
    const hero = RECIPES['hero-side']!;
    const mine = compileSprite(design({ type: '@player', base: 'hero-side', overlays: [{ x: 3, y: 0, rows: ['kkk'] }] }));
    expect(hero.anims['run']![0]![0]).toBe('........');
    expect(mine.anims['idle']![0]![0]).toBe('...kkkb.');
    expect(mine.anims['run']![0]![0]).toBe('........');
    expect(mine.anims['run']![0]![1]).toBe('...kkkb.');
  });

  it('paints the ramps it recolours in its own colour and leaves the others', () => {
    const plain = paintFrames(RECIPES['farmer']!, pal)[0]!.pc;
    const blue = paintFrames(compileSprite(design({ type: '@player', base: 'farmer', recolor: { garment: '#3060c0' } })), pal)[0]!.pc;
    // Row 6 of the template (7 with the outline) is the shirt; the face at row 3 keeps its skin.
    expect(blue.get(3, 7)).not.toEqual(plain.get(3, 7));
    expect(blue.get(2, 7)[2]).toBeGreaterThan(blue.get(2, 7)[0]);
    expect(blue.get(4, 4)).toEqual(plain.get(4, 4));
  });

  it('refuses a base that is not shipped', () => {
    expect(() => compileSprite(design({ type: 'x', base: 'dragon' }))).toThrow(/no shipped sprite 'dragon'/);
    const { recipes, failed } = compileSheet({ version: 1, sprites: [design({ type: 'a', base: 'dragon' }), design({ type: 'b', base: 'walker' })] });
    expect(failed).toEqual(['a']);
    expect([...recipes.keys()]).toEqual(['b']);
  });
});

describe('sprite lookup', () => {
  const designs = compileSheet({ version: 1, sprites: [design({ type: 'moth', base: 'bat', recolor: { danger: '#c9b2e6' } })] }).recipes;

  it("draws a type with the game's design, else the shipped sprite of the type it is drawn as, else its own", () => {
    expect(spriteFor('moth', { drawAs: 'chaser', designs })?.name).toBe('game:moth');
    expect(spriteFor('moth', { drawAs: 'chaser' })).toEqual({ name: 'bat', recipe: RECIPES['bat'] });
    expect(spriteFor('walker')?.name).toBe('walker');
    expect(spriteFor('stranger')).toBeNull();
  });

  it('offers as bases the shipped sprites of the same size, stance and facing', () => {
    expect(spriteBases('farmer')).toEqual(expect.arrayContaining(['farmer', 'hero-topdown']));
    for (const name of Object.keys(RECIPES)) {
      const bases = spriteBases(name);
      expect(bases[0]).toBe(name);
      for (const b of bases) expect(buildOf(RECIPES[b]!)).toBe(buildOf(RECIPES[name]!));
    }
    expect(spriteBases('ship')).not.toContain('walker');
    // Same size, other kind: a walker never starts from a growing crop, a drone never from a floor tile.
    expect(spriteBases('walker')).not.toContain('crop-root');
    expect(spriteBases('crop-root')).toEqual(['crop-root', 'crop-leafy', 'crop-bush']);
    expect(spriteBases('drone')).not.toContain('plot');
    expect(spriteBases('plot')).toEqual(['plot']);
    expect(spriteBases('nothing')).toEqual([]);
  });

  it("names the player's sprite by setting, and what each ramp paints", () => {
    expect(playerRecipe('side', 8)).toBe('hero-side');
    expect(playerRecipe('space', 8)).toBe('ship');
    expect(playerRecipe('farm', 8)).toBe('farmer');
    expect(playerRecipe('dungeon', 12)).toBe('keeper');
    expect(playerRecipe('field', 8)).toBe('hero-topdown');
    expect(Object.keys(rampsOf(RECIPES['farmer']!)).sort()).toEqual(['accent', 'garment', 'hero', 'wood']);
    expect(rampsOf(RECIPES['hopper']!).secondary).toBeGreaterThan(0);
  });
});

describe('paintDesignSheet', () => {
  it('draws a row per design that compiles: its base at rest beside the design at rest', () => {
    const one = paintDesignSheet({ version: 1, sprites: [design({ type: '@player', base: 'farmer', recolor: { garment: '#7a68a6' } })] }, pal);
    const two = paintDesignSheet({ version: 1, sprites: [design({ type: '@player', base: 'farmer' }), design({ type: 'moth', base: 'bat' }), design({ type: 'ghost', base: 'dragon' })] }, pal);
    // Three facings of the farmer twice, each 10 px wide with its outline, after the label.
    expect(one.w).toBeGreaterThan(6 * 10);
    expect(one.h).toBe(frameSize(RECIPES['farmer']!).h + 4);
    expect(two.h).toBe(frameSize(RECIPES['farmer']!).h + 4 + Math.max(9, frameSize(RECIPES['bat']!).h) + 4);
  });
});

