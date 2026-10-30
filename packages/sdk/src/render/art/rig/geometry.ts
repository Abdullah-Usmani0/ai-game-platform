import { sinCosDeg } from '../../../sim/trig.js';

/** A point or offset in a rig's frame, in pixels: x to the right, y down. */
export interface Vec {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec => ({ x, y });
export const plus = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Smoothstep: slow out, fast through the middle, slow in. */
export const ease = (t: number): number => t * t * (3 - 2 * t);

/** A step of a length at an angle in degrees (0 east, 90 south), the same to the last bit on every engine. */
export function polar(deg: number, len: number): Vec {
  const [s, c] = sinCosDeg(deg);
  return { x: c * len, y: s * len };
}

/** atan2 in degrees from plain arithmetic (within about 0.012 degrees), the same on every engine where Math.atan2 may not be. */
export function atan2Deg(y: number, x: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax === 0 && ay === 0) return 0;
  const a = Math.min(ax, ay) / Math.max(ax, ay);
  const s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = 1.5707963267948966 - r;
  if (x < 0) r = 3.141592653589793 - r;
  if (y < 0) r = -r;
  return r * 57.29577951308232;
}

export const dist = (a: Vec, b: Vec): number => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
