import type { RGB } from '../color.js';
import { PixelCanvas } from '../pixels.js';

/** Perceptual distance between two colours ("redmean": cheap, and close to how the eye ranks them). */
export function colourDistance(a: RGB, b: RGB): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/**
 * Every opaque pixel to a colour of the palette: the nearest, or with `dither` (0 to 1) an ordered dither between the
 * two nearest where the pixel sits between them.
 */
export function quantize(src: PixelCanvas, palette: readonly RGB[], dither = 0): PixelCanvas {
  const out = new PixelCanvas(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (!src.alpha(x, y)) continue;
      const c = src.get(x, y);
      let best = 0;
      let second = 0;
      let d1 = Infinity;
      let d2 = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const d = colourDistance(c, palette[i]!);
        if (d < d1) {
          second = best;
          d2 = d1;
          best = i;
          d1 = d;
        } else if (d < d2) {
          second = i;
          d2 = d;
        }
      }
      // How far toward the second colour the pixel sits, 0 to 0.5.
      const t = d1 + d2 > 0 ? d1 / (d1 + d2) : 0;
      const pick = dither > 0 && t * dither * 2 > (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16 ? second : best;
      out.set(x, y, palette[pick]!);
    }
  }
  return out;
}

/**
 * Makes a layer wrap horizontally. The layer is painted `band` px wider than it ends up; across its first `band`
 * columns it gives way, with an ordered dither, to that extra strip (what comes after its right edge), so the right
 * edge runs on into the left one when the layer repeats.
 */
export function tileable(src: PixelCanvas, band: number): PixelCanvas {
  const w = src.w - band;
  const out = new PixelCanvas(w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < w; x++) {
      // Near the left edge the continuation shows; by the end of the band, the column's own pixels.
      const own = x >= band || (x + 1) / (band + 1) > (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
      const sx = own ? x : w + x;
      if (src.alpha(sx, y)) out.set(x, y, src.get(sx, y), src.alpha(sx, y));
    }
  }
  return out;
}
