/** Degrees to radians, as a literal: the same double on every engine. */
const RAD = 0.017453292519943295;

/**
 * The sine and cosine of an angle in degrees, the same to the last bit on every engine: plain arithmetic, where
 * Math.sin and Math.cos may round differently from one browser to another, and a run replayed elsewhere must not drift.
 * Accurate to about 1e-11.
 */
export function sinCosDeg(deg: number): [sin: number, cos: number] {
  const quarter = Math.round(deg / 90);
  const r = (deg - quarter * 90) * RAD;
  const r2 = r * r;
  // Taylor series on [-45, 45] degrees, nested.
  const s = r * (1 - (r2 / 6) * (1 - (r2 / 20) * (1 - (r2 / 42) * (1 - (r2 / 72) * (1 - r2 / 110)))));
  const c = 1 - (r2 / 2) * (1 - (r2 / 12) * (1 - (r2 / 30) * (1 - (r2 / 56) * (1 - (r2 / 90) * (1 - r2 / 132)))));
  switch (((quarter % 4) + 4) % 4) {
    case 0:
      return [s, c];
    case 1:
      return [c, -s];
    case 2:
      return [-s, -c];
    default:
      return [-c, s];
  }
}
