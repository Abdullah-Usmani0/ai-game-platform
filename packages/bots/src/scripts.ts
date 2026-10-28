import type { InputSegment } from '@gg/sdk';

/** A default scripted run: run right, with periodic held jumps. Deterministic and genre-neutral enough for smoke tests. */
export function runnerScript(ticks: number, jumpEvery = 45, jumpHold = 12): InputSegment[] {
  const segments: InputSegment[] = [{ from: 0, to: ticks, input: { right: true } }];
  for (let t = 20; t < ticks; t += jumpEvery) segments.push({ from: t, to: Math.min(ticks, t + jumpHold), input: { jump: true } });
  return segments;
}
