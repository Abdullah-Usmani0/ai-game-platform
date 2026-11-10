import { sinCosDeg } from '../../sim/trig.js';
import type { ArtPalette } from './palette.js';
import { PixelCanvas } from './pixels.js';
import { legendFor, type Recipe } from './sprites.js';

/**
 * Sprites that turn: a vehicle seen from above is drawn once, facing east, and turned into sixteen headings when its
 * sheet is built, so a bike, a car or a ship faces every way it can drive without anyone drawing it sixteen times.
 */

/** The headings a turning sprite is drawn in: one every 22.5 degrees, clockwise from east. */
export const HEADINGS = 16;

/** The nearest of the sixteen heading frames to an angle in degrees (0 east, 90 south, as y runs down the screen). */
export function headingFrame(deg: number): number {
  return ((Math.round(deg / (360 / HEADINGS)) % HEADINGS) + HEADINGS) % HEADINGS;
}

/** The side of the square a w x h sprite turns in without losing a corner. */
export function turnSize(w: number, h: number): number {
  return Math.ceil(Math.hypot(w, h)) + 1;
}

/** A pixel's colour as one number (-1 where it is empty): Scale2x matches colours exactly. */
function colourAt(pc: PixelCanvas, x: number, y: number): number {
  if (!pc.inside(x, y) || pc.alpha(x, y) === 0) return -1;
  const [r, g, b] = pc.get(x, y);
  return (r << 16) | (g << 8) | b;
}

function copyPixel(from: PixelCanvas, fx: number, fy: number, to: PixelCanvas, tx: number, ty: number): void {
  if (from.alpha(fx, fy) === 0) return;
  to.set(tx, ty, from.get(fx, fy), from.alpha(fx, fy));
}

/** Scale2x (EPX): twice the size, a diagonal edge kept a diagonal rather than doubled into steps. */
function scale2x(src: PixelCanvas): PixelCanvas {
  const out = new PixelCanvas(src.w * 2, src.h * 2);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const p = colourAt(src, x, y);
      const a = colourAt(src, x, y - 1);
      const b = colourAt(src, x + 1, y);
      const c = colourAt(src, x - 1, y);
      const d = colourAt(src, x, y + 1);
      // Each quarter takes the neighbour on its side when the two neighbours there agree and the other two do not.
      const quarter = (take: boolean, nx: number, ny: number, tx: number, ty: number): void => {
        if (take) copyPixel(src, nx, ny, out, tx, ty);
        else if (p !== -1) copyPixel(src, x, y, out, tx, ty);
      };
      quarter(c === a && c !== d && a !== b && a !== -1, x, y - 1, 2 * x, 2 * y);
      quarter(a === b && a !== c && b !== d && b !== -1, x + 1, y, 2 * x + 1, 2 * y);
      quarter(d === c && d !== b && c !== a && c !== -1, x - 1, y, 2 * x, 2 * y + 1);
      quarter(b === d && b !== a && d !== c && d !== -1, x, y + 1, 2 * x + 1, 2 * y + 1);
    }
  }
  return out;
}

/**
 * A sprite turned `deg` degrees clockwise about its centre into a size x size square, RotSprite's way: scaled up eight
 * times by Scale2x, turned there to the nearest pixel, and brought back down by the pixel at the centre of each 8 x 8
 * block. Its lines stay one pixel wide and its colours its own, where a plain turn scatters and drops pixels.
 */
export function turnSprite(src: PixelCanvas, deg: number, size: number): PixelCanvas {
  const big = scale2x(scale2x(scale2x(src)));
  const out = new PixelCanvas(size, size);
  const [sin, cos] = sinCosDeg(deg);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // The centre of this pixel, eight times over, about the middle, turned back to where it came from.
      const ox = (x + 0.5 - size / 2) * 8;
      const oy = (y + 0.5 - size / 2) * 8;
      const sx = Math.floor(big.w / 2 + ox * cos + oy * sin);
      const sy = Math.floor(big.h / 2 - ox * sin + oy * cos);
      if (big.inside(sx, sy)) copyPixel(big, sx, sy, out, x, y);
    }
  }
  return out;
}

/** The frame size of a turning recipe: the square its widest frame turns in, and a pixel for the outline each side. */
export function turnFrameSize(recipe: Recipe): number {
  let size = 0;
  for (const frames of Object.values(recipe.anims)) for (const t of frames) size = Math.max(size, turnSize(Math.max(...t.map((r) => r.length)), t.length));
  return size + 2;
}

/** Every frame of a turning recipe in each of the sixteen headings, painted, turned, then outlined. */
export function paintTurns(recipe: Recipe, pal: ArtPalette): Array<{ anim: string; frame: number; heading: number; pc: PixelCanvas }> {
  const legend = legendFor(pal, recipe.tune?.(pal));
  const size = turnFrameSize(recipe);
  const out: Array<{ anim: string; frame: number; heading: number; pc: PixelCanvas }> = [];
  for (const [anim, frames] of Object.entries(recipe.anims)) {
    frames.forEach((t, frame) => {
      const w = Math.max(...t.map((r) => r.length));
      const src = new PixelCanvas(w, t.length);
      src.stamp(t, legend, 0, 0);
      for (let heading = 0; heading < HEADINGS; heading++) {
        const turned = turnSprite(src, heading * (360 / HEADINGS), size - 2);
        const pc = new PixelCanvas(size, size);
        pc.blit(turned, 1, 1);
        if (!recipe.noOutline) pc.outline(pal.outline, pal.ink);
        out.push({ anim, frame, heading, pc });
      }
    });
  }
  return out;
}
