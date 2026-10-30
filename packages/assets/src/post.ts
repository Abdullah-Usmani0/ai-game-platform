import { PixelCanvas, type RGB } from '@gg/sdk/art';

/** Perceptual distance between two colours ("redmean": cheap, and close to how the eye ranks them). */
export function colourDistance(a: RGB, b: RGB): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Shrinks an image onto a pixel grid of w x h, each pixel the mean of the opaque source pixels it covers. */
export function toGrid(src: PixelCanvas, w: number, h: number): PixelCanvas {
  const out = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * src.w) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.w) / w));
      const y0 = Math.floor((y * src.h) / h);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.h) / h));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      let cells = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          cells++;
          if (!src.alpha(sx, sy)) continue;
          const c = src.get(sx, sy);
          r += c[0];
          g += c[1];
          b += c[2];
          n++;
        }
      }
      // A pixel at least half covered keeps the colour; less, and it stays clear.
      if (n * 2 >= cells) out.set(x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
    }
  }
  return out;
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
