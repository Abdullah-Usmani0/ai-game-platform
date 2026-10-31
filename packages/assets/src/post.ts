import { colourDistance, PixelCanvas, quantize, tileable } from '@gg/sdk/art';

/** The colour work the view shares (perceptual distance, palette mapping, wrapping layers) lives in the art kit. */
export { colourDistance, quantize, tileable };

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
