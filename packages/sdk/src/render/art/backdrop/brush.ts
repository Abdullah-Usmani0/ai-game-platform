/** Painting primitives for procedural backdrops: dithered gradients, polygons, circles and value noise, all deterministic. */
import type { RGB } from '../color.js';
import { hash2, type PixelCanvas } from '../pixels.js';

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

/** Pick between two colours by t with an ordered dither. */
export const dith = (x: number, y: number, a: RGB, b: RGB, t: number): RGB => (t > bayer(x, y) ? b : a);

/** A colour from a list of stops at t in 0..1, dithered between neighbouring stops. */
export function bandAt(x: number, y: number, stops: readonly RGB[], t: number): RGB {
  const f = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(f);
  return dith(x, y, stops[i]!, stops[Math.min(stops.length - 1, i + 1)]!, f - i);
}

export function vgradient(pc: PixelCanvas, stops: readonly RGB[], y0 = 0, y1 = pc.h): void {
  for (let y = y0; y < y1; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, bandAt(x, y, stops, (y - y0) / (y1 - y0)));
}

/** Smooth value noise on a lattice of `cell` px, wrapping every `wrap` px horizontally (so layers tile). */
export function noise(x: number, y: number, cell: number, seed: number, wrap = 0): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const cols = wrap > 0 ? Math.round(wrap / cell) : 0;
  const h = (i: number, j: number) => hash2(cols ? ((i % cols) + cols) % cols : i, j, seed);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

export function fbm(x: number, y: number, cell: number, seed: number, octaves = 3, wrap = 0): number {
  let v = 0;
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    v += noise(x, y, cell / (1 << o), seed + o * 101, wrap) * amp;
    total += amp;
    amp /= 2;
  }
  return v / total;
}

export interface P { x: number; y: number }

/** Fill a polygon (even-odd), colour chosen per pixel. */
export function fillPoly(pc: PixelCanvas, pts: readonly P[], color: (x: number, y: number) => RGB | null): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(pc.h - 1, Math.ceil(maxY)); y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (a.y > cy !== b.y > cy) xs.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k]! - 0.5)); x <= Math.min(pc.w - 1, Math.floor(xs[k + 1]! - 0.5)); x++) {
        const c = color(x, y);
        if (c) pc.set(x, y, c);
      }
    }
  }
}

export function fillRect(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, color: (x: number, y: number) => RGB | null): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(pc.h, Math.floor(y0 + h)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(pc.w, Math.floor(x0 + w)); x++) {
    const c = color(x, y);
    if (c) pc.set(x, y, c);
  }
}

export function fillCircle(pc: PixelCanvas, cx: number, cy: number, r: number, color: (x: number, y: number, d: number) => RGB | null): void {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    const d = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
    if (d <= r) {
      const c = color(x, y, d / r);
      if (c && pc.inside(x, y)) pc.set(x, y, c);
    }
  }
}

/** A gothic (equilateral) pointed arch: each side an arc centred on the opposite springer, over a rectangle h tall. */
export function pointedArch(x: number, y: number, w: number, h: number, steps = 12): P[] {
  const rise = w * 0.866;
  const spring = y + rise;
  const left: P[] = [];
  for (let i = 0; i <= steps; i++) {
    // From the left springer (angle 180 on a circle round the right springer) up to the apex (angle 240).
    const a = ((180 + (60 * i) / steps) * Math.PI) / 180;
    left.push({ x: x + w + w * Math.cos(a), y: spring + w * Math.sin(a) });
  }
  const right = left.map((p) => ({ x: 2 * x + w - p.x, y: p.y })).reverse();
  return [{ x, y: spring + h }, ...left, ...right.slice(1), { x: x + w, y: spring + h }];
}
