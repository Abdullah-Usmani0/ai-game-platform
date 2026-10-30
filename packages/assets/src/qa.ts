import type { PixelCanvas, RGB } from '@gg/sdk/art';
import type { Layer } from './painter/index.js';

/** What the backdrop QA measured. */
export interface BackdropMeasure {
  /** Opaque pixels whose colour is not one of the palette's. */
  offPalette: number;
  /** Share of the painted aligned 2x2 blocks that are one colour: near 1, the image was drawn at a coarser grid and scaled up. */
  blocky: number;
  /** How much the right edge differs from the left one, against how much neighbouring columns differ: near 1 wraps cleanly. */
  seam: number;
  /** Share of pixels left clear. */
  clear: number;
  /** The brightest tenth's luminance (0 to 1). */
  bright: number;
}

const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const diff = (img: PixelCanvas, ax: number, ay: number, bx: number, by: number) => {
  const a = img.get(ax, ay);
  const b = img.get(bx, by);
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
};

export function measureBackdrop(img: PixelCanvas, palette: readonly RGB[]): BackdropMeasure {
  const keys = new Set(palette.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
  let offPalette = 0;
  let clear = 0;
  const lums: number[] = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!img.alpha(x, y)) {
        clear++;
        continue;
      }
      const c = img.get(x, y);
      if (!keys.has((c[0] << 16) | (c[1] << 8) | c[2])) offPalette++;
      lums.push(lum(c));
    }
  }
  let blocks = 0;
  let flat = 0;
  for (let y = 0; y + 1 < img.h; y += 2) {
    for (let x = 0; x + 1 < img.w; x += 2) {
      // Only blocks fully painted: clear space says nothing about the grid it was drawn on.
      if (!img.alpha(x, y) || !img.alpha(x + 1, y) || !img.alpha(x, y + 1) || !img.alpha(x + 1, y + 1)) continue;
      blocks++;
      if (diff(img, x, y, x + 1, y) === 0 && diff(img, x, y, x, y + 1) === 0 && diff(img, x, y, x + 1, y + 1) === 0) flat++;
    }
  }
  let edge = 0;
  let inner = 0;
  for (let y = 0; y < img.h; y++) {
    edge += diff(img, img.w - 1, y, 0, y);
    for (let x = 0; x + 1 < img.w; x++) inner += diff(img, x, y, x + 1, y);
  }
  const meanInner = inner / Math.max(1, (img.w - 1) * img.h);
  lums.sort((a, b) => a - b);
  return {
    offPalette,
    blocky: blocks ? flat / blocks : 0,
    seam: meanInner > 0 ? edge / img.h / meanInner : 0,
    clear: clear / (img.w * img.h),
    bright: lums.length ? lums[Math.floor(lums.length * 0.9)]! : 0,
  };
}

export interface BackdropIssue {
  code: string;
  message: string;
}

/** The limits a backdrop layer is held to. */
export const BACKDROP_LIMITS = { blocky: 0.97, seam: 3 } as const;

/**
 * Backdrop QA: every pixel on the game's palette, drawn at the game's pixel size (not a coarser grid scaled up), the
 * far layer opaque, the layer wrapping cleanly when it repeats, and as bright as the play allows (`maxBright`).
 */
export function checkBackdrop(img: PixelCanvas, opts: { palette: readonly RGB[]; layer: Layer; maxBright?: number; tiles?: boolean }): { ok: boolean; issues: BackdropIssue[]; measure: BackdropMeasure } {
  const m = measureBackdrop(img, opts.palette);
  const issues: BackdropIssue[] = [];
  if (m.offPalette) issues.push({ code: 'backdrop_palette', message: `${m.offPalette} pixel(s) off the palette` });
  if (m.blocky > BACKDROP_LIMITS.blocky) issues.push({ code: 'backdrop_pixel_size', message: `${Math.round(m.blocky * 100)}% of its 2x2 blocks are one colour: drawn at a coarser grid and scaled up` });
  if (opts.layer === 'far' && m.clear > 0) issues.push({ code: 'backdrop_clear', message: `the far layer leaves ${Math.round(m.clear * 1000) / 10}% of its pixels clear` });
  if (opts.tiles !== false && m.seam > BACKDROP_LIMITS.seam) issues.push({ code: 'backdrop_seam', message: `its edges differ ${m.seam.toFixed(1)} times as much as neighbouring columns: it does not wrap` });
  if (opts.maxBright !== undefined && m.bright > opts.maxBright) issues.push({ code: 'backdrop_bright', message: `its brightest tenth reaches ${m.bright.toFixed(2)}, above the ${opts.maxBright.toFixed(2)} the play reads in front of` });
  return { ok: issues.length === 0, issues, measure: m };
}
