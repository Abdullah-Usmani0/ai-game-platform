import { describe, expect, it } from 'vitest';
import {
  GLYPHS,
  PixelCanvas,
  RECIPES,
  SETTING_BY_GENRE,
  TYPE_RECIPES,
  artPalette,
  recipeForType,
  depthField,
  frameSize,
  luminance,
  measure,
  paintFrames,
  paintRegion,
  prepareLevelArt,
  rgbToHsl,
  settingFor,
  sfxFor,
  textImage,
  torchSpots,
  wrapText,
  type ArtPalette,
  type PaletteRoles,
  type TerrainMap,
} from './index.js';

/** The six samples' palettes, a light one and a near-monochrome one. */
const PALETTES: Record<string, PaletteRoles> = {
  platformer: { background: '#1b1b2f', mid: '#4f5d75', foreground: '#f2f2f2', accent: '#ffd166', danger: '#ef476f', ui: '#ffffff' },
  survivors: { background: '#14101c', mid: '#3d3550', foreground: '#f6f1d1', accent: '#8bd3dd', danger: '#f26b5b', ui: '#ffffff' },
  topdown: { background: '#1a1210', mid: '#4a3328', foreground: '#f5e6c8', accent: '#ff9f43', danger: '#e63946', ui: '#ffffff' },
  shmup: { background: '#0b1026', mid: '#263a6b', foreground: '#eaf2ff', accent: '#5ee0ff', danger: '#ff4d6d', ui: '#ffffff' },
  metroidvania: { background: '#0d0b16', mid: '#3b3552', foreground: '#f2e9d8', accent: '#ffc857', danger: '#e4572e', ui: '#9ad1d4' },
  puzzle: { background: '#17130f', mid: '#5a4632', foreground: '#f3e3c3', accent: '#d9822b', danger: '#c0392b', ui: '#7bd389' },
  daylight: { background: '#79b4ff', mid: '#6b4b2a', foreground: '#f6f1e6', accent: '#ffd966', danger: '#e04b4b', ui: '#e9e3d3' },
  mono: { background: '#000000', mid: '#3a3a3a', foreground: '#ffffff', accent: '#ffff00', danger: '#ff0000', ui: '#ffffff' },
};

const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('palette', () => {
  for (const [name, roles] of Object.entries(PALETTES)) {
    it(`${name}: every ramp runs dark to light, ink is the darkest colour, the garment is far from the danger hue`, () => {
      const pal = artPalette(roles);
      for (const key of ['terrain', 'rim', 'floor', 'hero', 'garment', 'accent', 'danger', 'ui', 'wood'] as const) {
        const ramp = pal[key];
        expect(ramp).toHaveLength(5);
        for (const c of ramp) for (const v of c) expect(Number.isInteger(v) && v >= 0 && v <= 255, `${key} ${c.join(',')}`).toBe(true);
        for (let i = 1; i < 5; i++) expect(luminance(ramp[i]!) + 0.002, `${key}[${i}]`).toBeGreaterThanOrEqual(luminance(ramp[i - 1]!));
      }
      for (const c of pal.terrain) expect(luminance(pal.ink)).toBeLessThanOrEqual(luminance(c));
      const danger = rgbToHsl(pal.danger[2])[0];
      expect(hueGap(rgbToHsl(pal.garment[2])[0], danger)).toBeGreaterThan(120);
    });
  }
});

describe('sprites', () => {
  const pal = artPalette(PALETTES['platformer']!);

  it('every frame of a recipe has one size, every template is rectangular and every letter has a colour', () => {
    for (const [name, recipe] of Object.entries(RECIPES)) {
      const { w, h } = frameSize(recipe);
      for (const [anim, frames] of Object.entries(recipe.anims)) {
        expect(frames.length, `${name}.${anim}`).toBeGreaterThan(0);
        for (const t of frames) {
          expect(t.length + 2, `${name}.${anim} rows`).toBe(h);
          for (const row of t) expect(row.length + 2, `${name}.${anim} '${row}'`).toBe(w);
        }
      }
      for (const roles of Object.values(PALETTES)) expect(() => paintFrames(recipe, artPalette(roles)), name).not.toThrow();
    }
  });

  it('maps the shipped entity types to recipes that exist; players have every animation they are asked for', () => {
    for (const [type, recipe] of Object.entries(TYPE_RECIPES)) expect(RECIPES[recipe], type).toBeDefined();
    // A renamed type draws as the shipped type it names; an unknown one has no recipe (the renderer falls back by role).
    expect(recipeForType('wasp', 'chaser')).toBe(TYPE_RECIPES['chaser']);
    expect(recipeForType('chaser')).toBe(TYPE_RECIPES['chaser']);
    expect(recipeForType('wasp')).toBeUndefined();
    for (const anim of ['idle', 'run', 'jump', 'fall', 'dash', 'hurt']) expect(RECIPES['hero-side']!.anims[anim], anim).toBeDefined();
    for (const name of ['hero-topdown', 'keeper']) {
      for (const dir of ['down', 'up', 'side']) for (const anim of ['idle', 'run', 'hurt']) expect(RECIPES[name]!.anims[`${dir}-${anim}`], `${name} ${dir}-${anim}`).toBeDefined();
    }
  });

  it('outlines follow the style card: none adds nothing, dark rings the sprite in ink', () => {
    const opaque = (pc: PixelCanvas) => {
      let n = 0;
      for (let i = 3; i < pc.data.length; i += 4) if (pc.data[i]! > 0) n++;
      return n;
    };
    const none = paintFrames(RECIPES['walker']!, { ...pal, outline: 'none' })[0]!.pc;
    const dark = paintFrames(RECIPES['walker']!, { ...pal, outline: 'dark' })[0]!.pc;
    expect(opaque(dark)).toBeGreaterThan(opaque(none));
    for (let y = 0; y < dark.h; y++) {
      for (let x = 0; x < dark.w; x++) if (none.alpha(x, y) === 0 && dark.alpha(x, y) > 0) expect(dark.get(x, y)).toEqual([...pal.ink]);
    }
  });
});

describe('font', () => {
  it('every glyph is seven rows; digits keep their full width so counters do not jitter', () => {
    for (const [ch, g] of Object.entries(GLYPHS)) expect(g.length, ch).toBe(7);
    for (const d of '0123456789') expect(measure(d), d).toBe(5);
    expect(measure('I')).toBeLessThan(5);
    expect(measure('1111')).toBe(measure('8888'));
  });

  it('text images are padded by one pixel and outlined', () => {
    const pal = artPalette(PALETTES['platformer']!);
    const img = textImage('SCORE 10', { color: pal.white, ink: pal.ink });
    expect(img.w).toBe(measure('SCORE 10') + 2);
    expect(img.h).toBe(9);
    expect(img.get(1, 1)).toEqual([...pal.ink]);
  });

  it('wraps words into lines that fit, keeping a too-long word on a line of its own', () => {
    const lines = wrapText('STRIKES DEAL ONE MORE DAMAGE.', 60);
    expect(lines.join(' ')).toBe('STRIKES DEAL ONE MORE DAMAGE.');
    for (const l of lines) expect(measure(l), l).toBeLessThanOrEqual(60);
    expect(lines.length).toBeGreaterThan(1);
    expect(wrapText('UNBREAKABLEWORD', 10)).toEqual(['UNBREAKABLEWORD']);
    expect(wrapText('  ', 50)).toEqual([]);
  });

  it('scaled blits turn each pixel into a block and skip transparency', () => {
    const src = new PixelCanvas(2, 1);
    src.set(0, 0, [255, 0, 0]);
    const dst = new PixelCanvas(6, 4);
    dst.blitScaled(src, 1, 1, 2);
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) expect(dst.get(x, y)).toEqual([255, 0, 0]);
    expect(dst.alpha(3, 1)).toBe(0);
    expect(dst.alpha(0, 0)).toBe(0);
  });
});

function tilemap(rows: string[], tileSize = 8): TerrainMap {
  const kinds: Record<string, string> = { '#': 'solid', '^': 'hazard', '=': 'oneway', G: 'goal', '.': 'air' };
  return { width: rows[0]!.length, height: rows.length, tileSize, kindAt: (tx, ty) => kinds[rows[ty]![tx]!] ?? 'air' };
}

const lum = (pc: PixelCanvas, x: number, y: number) => luminance(pc.get(x, y));

describe('terrain', () => {
  const pal: ArtPalette = artPalette(PALETTES['platformer']!);
  const side = tilemap(['........', '........', '..####..', '..####..', '########', '########']);

  it('depth is zero in the air and grows one pixel per pixel straight down into rock', () => {
    const depth = depthField(side);
    const W = side.width * 8;
    expect(depth[4 * W + 4]).toBe(0);
    for (let k = 0; k < 14; k++) expect(depth[(32 + k) * W + 4], `row ${32 + k}`).toBe(k + 1);
  });

  it('side rock: moss along open tops, darkness deep inside, open air left clear', () => {
    const art = prepareLevelArt(pal, 'side', side, false);
    const pc = new PixelCanvas(64, 48);
    paintRegion(art, pc, 0, 0);
    expect([pal.rim[2], pal.rim[3], pal.rim[4]].map((c) => c.join())).toContain(pc.get(4, 32).join());
    expect(lum(pc, 4, 46)).toBeLessThan(luminance(pal.terrain[1]));
    expect(pc.alpha(4, 4)).toBe(0);
  });

  it('paints the same pixels every time, and chunks join without seams', () => {
    const map = tilemap(['..........', '...##.....', '..........', '####..####', '####^^####', '##########']);
    const art = prepareLevelArt(pal, 'side', map, false);
    const whole = new PixelCanvas(80, 48);
    paintRegion(art, whole, 0, 0);
    const again = new PixelCanvas(80, 48);
    paintRegion(prepareLevelArt(pal, 'side', map, false), again, 0, 0);
    expect(Buffer.from(again.data).equals(Buffer.from(whole.data))).toBe(true);
    // Split across the surface row (y = 24): tufts growing up from the lower chunk must still land in the upper one.
    const top = new PixelCanvas(40, 24);
    const bottom = new PixelCanvas(40, 24);
    paintRegion(art, top, 40, 0);
    paintRegion(art, bottom, 40, 24);
    for (let y = 0; y < 48; y++) {
      for (let x = 40; x < 80; x++) {
        const part = y < 24 ? top : bottom;
        const i = ((y % 24) * 40 + (x - 40)) * 4;
        const j = (y * 80 + x) * 4;
        expect([...part.data.slice(i, i + 4)], `pixel ${x},${y}`).toEqual([...whole.data.slice(j, j + 4)]);
      }
    }
  });

  it('torches hang on straight walls facing a room, at least seven tiles apart', () => {
    const map = tilemap(['##############################', ...Array.from({ length: 6 }, () => '#............................#'), '##############################']);
    const spots = torchSpots(map);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      expect(s.ty).toBe(0);
      expect(map.kindAt(s.tx, 1)).toBe('air');
    }
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty))).toBeGreaterThanOrEqual(7);
  });

  it('dungeon floors sit in shadow away from torches and warm up near them', () => {
    const map = tilemap(['#####', ...Array.from({ length: 16 }, () => '#...#'), '#####']);
    const lit = { ...prepareLevelArt(pal, 'dungeon', map, false), lights: [{ x: 20, y: 8, radius: 40 }] };
    const flat = { ...lit, lights: [] };
    const a = new PixelCanvas(40, 144);
    const b = new PixelCanvas(40, 144);
    paintRegion(lit, a, 0, 0);
    paintRegion(flat, b, 0, 0);
    expect(lum(a, 20, 14)).toBeGreaterThan(lum(b, 20, 14));
    expect(lum(a, 20, 120)).toBeLessThan(lum(b, 20, 120));
  });

  it('every genre has a setting; unknown genres fall back by how the player moves', () => {
    expect(settingFor('platformer', 'platformer')).toBe('side');
    expect(settingFor('shmup', 'topdown')).toBe('space');
    expect(settingFor('something-new', 'topdown')).toBe('dungeon');
    expect(settingFor(undefined, undefined)).toBe('side');
    expect(Object.keys(SETTING_BY_GENRE)).toEqual(expect.arrayContaining(['platformer', 'survivors', 'topdown-action', 'shmup', 'metroidvania', 'puzzle']));
  });
});

describe('sound', () => {
  const isPlayer = (id: unknown) => id === 1;
  it('maps gameplay events to presets and tells the player apart from everything else', () => {
    expect(sfxFor('death', { entity: 1 }, isPlayer)).toBe('death');
    expect(sfxFor('death', { entity: 7 }, isPlayer)).toBe('enemyDeath');
    expect(sfxFor('damage', { target: 1 }, isPlayer)).toBe('damage');
    expect(sfxFor('damage', { target: 7 }, isPlayer)).toBeNull();
    expect(sfxFor('custom:fire', {}, isPlayer)).toBe('shoot');
    expect(sfxFor('custom:door_open', {}, isPlayer)).toBe('door');
    expect(sfxFor('jump', {}, isPlayer)).toBe('jump');
    expect(sfxFor('custom:unknown', {}, isPlayer)).toBeNull();
  });
});
