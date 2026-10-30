import { describe, expect, it } from 'vitest';
import { sinCosDeg } from './trig.js';

describe('sinCosDeg', () => {
  it('matches Math.sin and Math.cos to within 1e-10 all the way round, either way', () => {
    for (let d = -725; d <= 725; d += 0.37) {
      const [s, c] = sinCosDeg(d);
      expect(Math.abs(s - Math.sin((d * Math.PI) / 180))).toBeLessThan(1e-10);
      expect(Math.abs(c - Math.cos((d * Math.PI) / 180))).toBeLessThan(1e-10);
    }
  });

  it('is exact at the compass points and keeps the identities a heading relies on', () => {
    expect(sinCosDeg(0)).toEqual([0, 1]);
    expect(sinCosDeg(90)).toEqual([1, -0]);
    expect(sinCosDeg(180)).toEqual([-0, -1]);
    expect(sinCosDeg(270)).toEqual([-1, 0]);
    for (const d of [12.5, 33, 61.25, 199, 301.7]) {
      const [s, c] = sinCosDeg(d);
      expect(Math.abs(s * s + c * c - 1)).toBeLessThan(1e-12);
      // A turn later it is the same angle (up to the rounding of d + 360 itself).
      const [s2, c2] = sinCosDeg(d + 360);
      expect(Math.abs(s2 - s) + Math.abs(c2 - c)).toBeLessThan(1e-12);
    }
  });
});
