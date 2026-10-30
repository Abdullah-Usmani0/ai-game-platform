import type { SpriteDesign, SpriteOverlay, SpriteRamp, SpriteSheet } from '@gg/schemas';
import { parseHex, ramp, type RGB } from './color.js';
import { drawText, GLYPHS, measure } from './font.js';
import type { ArtPalette } from './palette.js';
import { PixelCanvas, type Template } from './pixels.js';
import { frameSize, paintFrames, RECIPES, recipeForType, type Recipe } from './sprites.js';
import type { Setting } from './terrain.js';

/** The slot letters each ramp a design may recolour paints with, and the shade of the ramp each takes. */
export const RAMP_SLOTS: Readonly<Record<SpriteRamp, Readonly<Record<string, number>>>> = {
  hero: { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 },
  garment: { g: 1, G: 2, h: 3, H: 4 },
  accent: { a: 1, A: 2, b: 3, B: 4, c: 1, C: 2, z: 3, Z: 4 },
  danger: { x: 0, d: 1, D: 2, e: 3, E: 4 },
  secondary: { m: 1, M: 2, n: 3, N: 4 },
  rim: { o: 0, v: 1, V: 2, y: 3, Y: 4 },
  wood: { p: 0, q: 1, Q: 2, r: 3, R: 4 },
};

/** The ramps a recipe paints with and how many pixels of its first frame each paints: what recolouring one changes. */
export function rampsOf(recipe: Recipe): Partial<Record<SpriteRamp, number>> {
  const ramps: Partial<Record<SpriteRamp, number>> = {};
  const first = Object.values(recipe.anims)[0]![0]!;
  for (const ch of first.join('')) {
    const r = (Object.keys(RAMP_SLOTS) as SpriteRamp[]).find((k) => ch in RAMP_SLOTS[k]);
    if (r) ramps[r] = (ramps[r] ?? 0) + 1;
  }
  return ramps;
}

/** The first row of a template with anything painted on it. */
const topRow = (t: Template) => Math.max(0, t.findIndex((r) => /[^. ]/.test(r)));

/** The frame overlays are placed on: the sprite at rest (a four-way sprite's facing that way), which other frames bob from. */
function restFrame(base: Recipe, anim: string): Template {
  const facing = /^(down|up|side)-/.exec(anim)?.[1];
  return (facing ? base.anims[`${facing}-idle`]?.[0] : undefined) ?? Object.values(base.anims)[0]![0]!;
}

/**
 * A template with overlays painted on, over the base's pixels or under them where the base is clear, clipped to the
 * frame: '.' leaves a pixel, '_' clears it. `bob` moves them down with the body (a frame of a walk that sits a pixel
 * lower takes its hat with it).
 */
export function overlaid(t: Template, overlays: readonly SpriteOverlay[], bob = 0): Template {
  const w = Math.max(...t.map((r) => r.length));
  const grid = t.map((r) => [...r.padEnd(w, '.')]);
  for (const o of overlays) {
    o.rows.forEach((row, dy) => {
      const line = grid[o.y + bob + dy];
      if (!line) return;
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx]!;
        const x = o.x + dx;
        if (ch === '.' || x >= w) continue;
        if (o.under && line[x] !== '.' && line[x] !== ' ') continue;
        line[x] = ch === '_' ? '.' : ch;
      }
    });
  }
  return grid.map((r) => r.join(''));
}

/**
 * A game's design for one type as a recipe: its base's animations, frame size and anchor, the overlays painted on the
 * animations they name, and the base's colours with the design's own ramps over them.
 */
export function compileSprite(design: SpriteDesign, base: Recipe | undefined = RECIPES[design.base]): Recipe {
  if (!base) throw new Error(`no shipped sprite '${design.base}'`);
  const anims = Object.fromEntries(
    Object.entries(base.anims).map(([name, frames]) => {
      const on = design.overlays.filter((o) => o.anims === '*' || o.anims.includes(name));
      // Placed on the sprite at rest, and moved with the body in frames that sit lower or stretch higher.
      const rest = topRow(restFrame(base, name));
      return [name, on.length > 0 ? frames.map((f) => overlaid(f, on, topRow(f) - rest)) : frames];
    }),
  );
  const ramps = Object.entries(design.recolor ?? {}).flatMap(([r, hex]) => (hex ? [[r as SpriteRamp, ramp(parseHex(hex))] as const] : []));
  if (ramps.length === 0) return { ...base, anims };
  return {
    ...base,
    anims,
    tune: (pal: ArtPalette) => {
      const out: Partial<Record<string, RGB | null>> = { ...base.tune?.(pal) };
      for (const [r, shades] of ramps) for (const [slot, i] of Object.entries(RAMP_SLOTS[r])) out[slot] = shades[i]!;
      return out;
    },
  };
}

/** A game's designs compiled, by type; a design that does not compile is left out, so its type draws as it ships. */
export function compileSheet(sheet: SpriteSheet | null | undefined): { recipes: Map<string, Recipe>; failed: string[] } {
  const recipes = new Map<string, Recipe>();
  const failed: string[] = [];
  for (const d of sheet?.sprites ?? []) {
    try {
      recipes.set(d.type, compileSprite(d));
    } catch {
      failed.push(d.type);
    }
  }
  return { recipes, failed };
}

/**
 * What an entity type draws with: the game's own design for it, else its shipped recipe (its own, or that of the shipped
 * type it is drawn as). The renderer and the level editor both look sprites up here. `name` keys the texture.
 */
export function spriteFor(type: string, ctx: { drawAs?: string; designs?: ReadonlyMap<string, Recipe> } = {}): { name: string; recipe: Recipe } | null {
  const own = ctx.designs?.get(type);
  if (own) return { name: `game:${type}`, recipe: own };
  const name = recipeForType(type, ctx.drawAs);
  const recipe = name ? RECIPES[name] : undefined;
  return name && recipe ? { name, recipe } : null;
}

/** A recipe's build: its frame size, where it stands (its anchor) and whether it faces four ways. */
export function buildOf(r: Recipe): string {
  const { w, h } = frameSize(r);
  return `${w - 2}x${h - 2} ${r.anchor}${Object.keys(r.anims).some((a) => a.startsWith('down-')) ? ' four-way' : ''}`;
}

/**
 * The shipped sprites a design may start from when its type draws with `recipe`, that one first: those of the same
 * build, so it fits the body, and of the same kind (a crop grows through stages rather than walking, a floor tile lies
 * under everything).
 */
export function spriteBases(recipe: string): string[] {
  const own = RECIPES[recipe];
  if (!own) return [];
  const kind = (name: string, r: Recipe) => `${buildOf(r)}|${r.floor === true}|${name.startsWith('crop-')}`;
  const mine = kind(recipe, own);
  return [recipe, ...Object.keys(RECIPES).filter((n) => n !== recipe && kind(n, RECIPES[n]!) === mine)];
}

/** The shipped sprite the player draws with in a setting (a top-down player 12 px wide or more is the keeper). */
export function playerRecipe(setting: Setting, playerW: number): string {
  if (setting === 'side') return 'hero-side';
  if (setting === 'space') return 'ship';
  if (setting === 'farm') return 'farmer';
  return playerW >= 12 ? 'keeper' : 'hero-topdown';
}

/** A sprite's frames at rest: each facing's for a four-way sprite, else the first of every animation. */
function restFrames(r: Recipe, pal: ArtPalette): PixelCanvas[] {
  const facings = ['down-idle', 'up-idle', 'side-idle'].filter((a) => r.anims[a]);
  const names = facings.length > 0 ? facings : Object.keys(r.anims);
  return names.map((a) => paintFrames({ ...r, anims: { [a]: [r.anims[a]![0]!] } }, pal)[0]!.pc);
}

/**
 * A review sheet of a game's designs in its palette: one row per design, labelled with its type, the sprite it starts
 * from at rest and then the design at rest. A design that does not compile is left off.
 */
export function paintDesignSheet(sheet: SpriteSheet, pal: ArtPalette): PixelCanvas {
  const rows = sheet.sprites.flatMap((d) => {
    const base = RECIPES[d.base];
    if (!base) return [];
    try {
      const label = [...d.type.replace(/^@/, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').slice(0, 16)].filter((ch) => ch === ' ' || GLYPHS[ch]).join('');
      return [{ label, base: restFrames(base, pal), mine: restFrames(compileSprite(d, base), pal) }];
    } catch {
      return [];
    }
  });
  const label = Math.max(24, ...rows.map((r) => measure(r.label) + 6));
  const gap = 3;
  const width = (frames: readonly PixelCanvas[]) => frames.reduce((n, f) => n + f.w + gap, 0);
  const rowH = (r: (typeof rows)[number]) => Math.max(9, ...r.base.map((f) => f.h), ...r.mine.map((f) => f.h)) + 4;
  const W = Math.max(label, label + Math.max(0, ...rows.map((r) => width(r.base) + 8 + width(r.mine))));
  const H = Math.max(12, rows.reduce((n, r) => n + rowH(r), 0));
  const pc = new PixelCanvas(W, H);
  pc.fillRect(0, 0, W, H, pal.floor[1]);
  let y = 0;
  rows.forEach((r, i) => {
    const h = rowH(r);
    pc.fillRect(0, y, W, h, i % 2 === 0 ? pal.floor[1] : pal.floor[2]);
    drawText(pc, r.label, 2, y + 2, { color: pal.ui[3] });
    let x = label;
    for (const f of r.base) {
      pc.blit(f, x, y + 2);
      x += f.w + gap;
    }
    x += 8;
    for (const f of r.mine) {
      pc.blit(f, x, y + 2);
      x += f.w + gap;
    }
    y += h;
  });
  return pc;
}

