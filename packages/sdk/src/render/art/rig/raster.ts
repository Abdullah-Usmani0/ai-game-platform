import type { RGB, Ramp } from '../color.js';
import type { OutlineMode } from '../palette.js';
import { PixelCanvas } from '../pixels.js';
import { clamp01, type Vec } from './geometry.js';

/** A part's outline: a capsule tapering from one radius to another, or a polygon whose edges round off over `round` px. */
export type Shape = { kind: 'capsule'; a: Vec; b: Vec; ra: number; rb: number } | { kind: 'poly'; pts: readonly Vec[]; round: number };

export interface Part {
  id: string;
  shape: Shape;
  mat: Ramp;
  /** Draw order: a larger depth covers a smaller one. */
  depth: number;
  /** Shift of the shade index: the far limbs sit a step darker. */
  bias?: number;
  /** A shade forced on some pixels (a visor slit, a seam), else null. */
  mark?: (x: number, y: number) => number | null;
  /** What it is to the art QA: the body (the default), cloth that swings, gear held, or an effect that comes and goes. */
  layer?: 'body' | 'cloth' | 'gear' | 'effect';
}

interface Hit {
  inside: boolean;
  nx: number;
  ny: number;
  nz: number;
}
const MISS: Hit = { inside: false, nx: 0, ny: 0, nz: 0 };

function capsuleHit(s: Extract<Shape, { kind: 'capsule' }>, px: number, py: number): Hit {
  const abx = s.b.x - s.a.x;
  const aby = s.b.y - s.a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? clamp01(((px - s.a.x) * abx + (py - s.a.y) * aby) / len2) : 0;
  const r = s.ra + (s.rb - s.ra) * t;
  const dx = px - (s.a.x + abx * t);
  const dy = py - (s.a.y + aby * t);
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > r) return MISS;
  // A round cross-section: the normal leans out as the pixel nears the edge.
  const k = r > 0 ? d / r : 0;
  return { inside: true, nx: d > 0 ? (dx / d) * k : 0, ny: d > 0 ? (dy / d) * k : 0, nz: Math.sqrt(Math.max(0, 1 - k * k)) };
}

function polyHit(s: Extract<Shape, { kind: 'poly' }>, px: number, py: number): Hit {
  const p = s.pts;
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!;
    const b = p[j]!;
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  if (!inside) return MISS;
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[j]!;
    const b = p[i]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? clamp01(((px - a.x) * ex + (py - a.y) * ey) / l2) : 0;
    const dx = a.x + ex * t - px;
    const dy = a.y + ey * t - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) {
      best = d;
      bx = dx;
      by = dy;
    }
  }
  const k = s.round > 0 ? Math.max(0, 1 - best / s.round) : 0;
  const n = best > 0 ? 1 / best : 0;
  const nx = bx * n * k * 0.85;
  const ny = by * n * k * 0.85;
  return { inside: true, nx, ny, nz: Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) };
}

const hitOf = (s: Shape, x: number, y: number): Hit => (s.kind === 'capsule' ? capsuleHit(s, x, y) : polyHit(s, x, y));

/** The box a shape lies in: [x0, y0, x1, y1]. */
function boundsOf(s: Shape): [number, number, number, number] {
  if (s.kind === 'capsule') {
    const r = Math.max(s.ra, s.rb);
    return [Math.min(s.a.x, s.b.x) - r, Math.min(s.a.y, s.b.y) - r, Math.max(s.a.x, s.b.x) + r, Math.max(s.a.y, s.b.y) + r];
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of s.pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

/** How a rig is lit and inked. */
export interface Look {
  /** Toward the light, normalised: x right, y down, z toward the viewer. */
  light: readonly [number, number, number];
  /** N·L thresholds for shades 1 to 4 of a part's ramp. */
  bands: readonly [number, number, number, number];
  /** Width of the ordered dither around each threshold (0: hard bands). */
  dither: number;
  outline: OutlineMode;
  ink: RGB;
  /** A dark line on a part where another passes in front of it. */
  contour: boolean;
  /** A back light two shades up on the silhouette's edge away from the key light, above row `above`; none when absent. */
  rim?: { side: 1 | -1; above: number };
  /** The ground's row: nothing draws on it or below (the floor hides a blade that dips into it). */
  floor?: number;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

export interface Raster {
  color: PixelCanvas;
  /** A normal map: x and y up encoded as 0..255 round 128, z toward the viewer. */
  normal: PixelCanvas;
  /** Which part owns each pixel (an index into the parts), or -1. */
  owner: Int16Array;
}

/**
 * Draws parts as pixel art: each pixel centre belongs to the deepest part covering it (the last of the deepest), shaded by its normal into one of
 * its ramp's five shades (with an ordered dither at the band edges), then a contour where parts overlap, lone pixels
 * cleaned up, a back light and an outline. Only + - * / and sqrt, so every engine paints the same pixels.
 */
export function rasterize(parts: readonly Part[], w: number, h: number, look: Look): Raster {
  const owner = new Int16Array(w * h).fill(-1);
  const shadeIdx = new Int8Array(w * h);
  const normals = new Float64Array(w * h * 3);
  const depthAt = new Float64Array(w * h).fill(-Infinity);
  const rows = Math.min(h, look.floor ?? h);
  // Each part claims the pixel centres inside it within its own bounds; a deeper part (or a later one as deep) wins.
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const [bx0, by0, bx1, by1] = boundsOf(part.shape);
    for (let y = Math.max(0, Math.floor(by0)); y <= Math.min(rows - 1, Math.ceil(by1)); y++) {
      for (let x = Math.max(0, Math.floor(bx0)); x <= Math.min(w - 1, Math.ceil(bx1)); x++) {
        const o = y * w + x;
        if (part.depth < depthAt[o]!) continue;
        const hit = hitOf(part.shape, x + 0.5, y + 0.5);
        if (!hit.inside) continue;
        depthAt[o] = part.depth;
        owner[o] = i;
        normals[o * 3] = hit.nx;
        normals[o * 3 + 1] = hit.ny;
        normals[o * 3 + 2] = hit.nz;
      }
    }
  }
  const [lx, ly, lz] = look.light;
  for (let o = 0; o < w * h; o++) {
    const me = owner[o]!;
    if (me < 0) continue;
    const x = o % w;
    const y = (o - x) / w;
    const part = parts[me]!;
    const forced = part.mark?.(x, y) ?? null;
    if (forced !== null) {
      shadeIdx[o] = forced;
      continue;
    }
    const lit = normals[o * 3]! * lx + normals[o * 3 + 1]! * ly + normals[o * 3 + 2]! * lz;
    const jitter = look.dither > 0 ? (BAYER4[(y & 3) * 4 + (x & 3)]! / 16 - 0.47) * look.dither : 0;
    let idx = 0;
    for (let k = 0; k < 4; k++) if (lit + jitter > look.bands[k]!) idx = k + 1;
    shadeIdx[o] = Math.max(0, Math.min(4, idx + (part.bias ?? 0)));
  }
  if (look.contour) {
    // Where a part passes behind another, its edge darkens, so overlapping parts read apart.
    const src = Int8Array.from(shadeIdx);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        const me = owner[o]!;
        if (me < 0) continue;
        const d = parts[me]!.depth;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const other = owner[ny * w + nx]!;
          if (other >= 0 && parts[other]!.depth > d + 0.25) {
            shadeIdx[o] = Math.min(src[o]!, 0);
            break;
          }
        }
      }
    }
  }
  {
    // A lone pixel takes the shade most of its neighbours on the same part have.
    const src = Int8Array.from(shadeIdx);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const o = y * w + x;
        const me = owner[o]!;
        if (me < 0) continue;
        const counts = [0, 0, 0, 0, 0];
        let same = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const q = (y + dy) * w + x + dx;
            if (owner[q] !== me) continue;
            n++;
            counts[src[q]!]!++;
            if (src[q] === src[o]) same++;
          }
        }
        if (n >= 5 && same === 0) shadeIdx[o] = counts.indexOf(Math.max(...counts));
      }
    }
  }
  if (look.rim) {
    // The silhouette's edge on the far side from the key light catches a back light: two shades up its own ramp.
    const side = look.rim.side;
    const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && owner[y * w + x]! >= 0;
    const src = Int8Array.from(shadeIdx);
    for (let y = 0; y < Math.min(h, look.rim.above); y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        if (!filled(x, y) || filled(x + side, y) || !filled(x - side, y)) continue;
        if (normals[o * 3]! * side < 0.35) continue;
        shadeIdx[o] = Math.min(4, src[o]! + 2);
      }
    }
  }
  const color = new PixelCanvas(w, h);
  const normal = new PixelCanvas(w, h);
  for (let o = 0; o < w * h; o++) {
    const me = owner[o]!;
    if (me < 0) continue;
    const x = o % w;
    const y = (o - x) / w;
    color.set(x, y, parts[me]!.mat[shadeIdx[o]!]!);
    normal.set(x, y, [Math.round((normals[o * 3]! + 1) * 127.5), Math.round((1 - normals[o * 3 + 1]!) * 127.5), Math.round((normals[o * 3 + 2]! + 1) * 127.5)]);
  }
  color.outline(look.outline, look.ink);
  return { color, normal, owner };
}
