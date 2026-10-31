import { describe, expect, it } from 'vitest';
import { moveClipFrame } from './move-frames.js';

describe('moveClipFrame', () => {
  // The first cut: 6 ticks of wind-up, 4 that strike, 14 of recovery, drawn with a clip of 9 frames hitting on 3 and 4.
  const cut = { startup: 6, active: 4, recovery: 14 };
  const frames = (m: typeof cut, n: number, active?: readonly number[]) => Array.from({ length: m.startup + m.active + m.recovery }, (_, t) => moveClipFrame(m, t, n, active));

  it('shows the wind-up frames over the startup, the blow exactly while it strikes, the rest over the recovery', () => {
    const shown = frames(cut, 9, [3, 4]);
    expect(shown.slice(0, 6)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(shown.slice(6, 10)).toEqual([3, 3, 4, 4]);
    expect(shown.slice(10)).toEqual([5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8]);
  });

  it('holds the blow on a clip that ends with it, and steps the frames however the ticks fall', () => {
    // A plunge: drawn with four frames, hitting on the last two, held through a long fall and its landing.
    const plunge = { startup: 6, active: 30, recovery: 12 };
    const shown = frames(plunge, 4, [2, 3]);
    expect(shown.slice(0, 6)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(new Set(shown.slice(6, 36))).toEqual(new Set([2, 3]));
    expect(shown.slice(36).every((f) => f === 3)).toBe(true);
    // Every frame stays inside the clip, whatever the lengths.
    for (const m of [{ startup: 1, active: 1, recovery: 0 }, { startup: 40, active: 2, recovery: 3 }]) for (const n of [1, 2, 5, 11]) expect(frames(m, n, [Math.min(1, n - 1)]).every((f) => f >= 0 && f < n)).toBe(true);
  });

  it("puts the blow in the middle third of a clip that does not say where it is", () => {
    const shown = frames(cut, 9);
    expect(new Set(shown.slice(6, 10))).toEqual(new Set([3, 4, 5]));
    expect(Math.max(...shown.slice(0, 6))).toBeLessThan(3);
  });
});
