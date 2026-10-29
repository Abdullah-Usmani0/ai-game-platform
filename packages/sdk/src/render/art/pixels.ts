import { shade, type RGB } from './color.js';
import type { OutlineMode } from './palette.js';

/** A pixel template row: one character per pixel; '.' and ' ' are transparent. */
export type Template = readonly string[];
/** What each template character paints with; null leaves the pixel transparent. */
export type Legend = Readonly<Record<string, RGB | null>>;

/** Deterministic 0..1 noise from integer coordinates and a seed (textures look the same every boot). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** An RGBA pixel buffer the art kit paints into; render/canvas.ts turns it into a browser canvas for a texture. */
export class PixelCanvas {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: RGB | null, alpha = 255): void {
    if (!c || !this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = alpha;
  }

  clear(x: number, y: number): void {
    if (this.inside(x, y)) this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  alpha(x: number, y: number): number {
    return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3]! : 0;
  }

  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB, alpha = 255): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, alpha);
  }

  /** Paints a template at (ox, oy), mirrored when flip is set. */
  stamp(t: Template, legend: Legend, ox = 0, oy = 0, flip = false): void {
    const width = Math.max(...t.map((r) => r.length));
    t.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch === '.' || ch === ' ') continue;
        const c = legend[ch];
        if (c === undefined) throw new Error(`template character '${ch}' has no colour`);
        this.set(ox + (flip ? width - 1 - x : x), oy + y, c);
      }
    });
  }

  /**
   * One pixel of outline around everything opaque, in the style card's mode: dark (ink all round), colored (a darker
   * shade of the pixel it borders), selective (coloured on the lit top and left, ink on the bottom and right).
   */
  outline(mode: OutlineMode, ink: RGB): void {
    if (mode === 'none') return;
    const src = new Uint8ClampedArray(this.data);
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[(y * this.w + x) * 4 + 3]! > 0;
    const colorAt = (x: number, y: number): RGB => {
      const i = (y * this.w + x) * 4;
      return [src[i]!, src[i + 1]!, src[i + 2]!];
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (opaque(x, y)) continue;
        const n: Array<[number, number, 'lit' | 'dark']> = [
          [x, y + 1, 'lit'],
          [x + 1, y, 'lit'],
          [x, y - 1, 'dark'],
          [x - 1, y, 'dark'],
        ];
        const hit = n.find(([nx, ny]) => opaque(nx, ny));
        if (!hit) continue;
        if (mode === 'dark') this.set(x, y, ink);
        else if (mode === 'colored') this.set(x, y, shade(colorAt(hit[0], hit[1]), -0.62));
        else this.set(x, y, hit[2] === 'lit' ? shade(colorAt(hit[0], hit[1]), -0.5) : ink);
      }
    }
  }

  /** Copies another canvas in, skipping its transparent pixels. */
  blit(src: PixelCanvas, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        const a = src.data[i + 3]!;
        if (a === 0) continue;
        this.set(dx + x, dy + y, [src.data[i]!, src.data[i + 1]!, src.data[i + 2]!], a);
      }
    }
  }
}
