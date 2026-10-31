/** A move's phases in ticks, as its frame data gives them. */
export interface MoveTiming {
  startup: number;
  active: number;
  recovery: number;
}

/**
 * The frame of a clip of `n` frames that a move shows at its tick `t`, the clip's hitting frames (its smears) being
 * `active`: the frames before them over the startup, the hitting ones over the active ticks, the rest over the recovery.
 * So the frame that draws the blade's arc is on screen exactly while the move's boxes strike. A clip that names no
 * hitting frames has them in its middle third.
 */
export function moveClipFrame(m: MoveTiming, t: number, n: number, active?: readonly number[]): number {
  if (n <= 1) return 0;
  const a0 = Math.min(n - 1, active && active.length > 0 ? Math.min(...active) : Math.floor(n / 3));
  const a1 = Math.min(n - 1, active && active.length > 0 ? Math.max(...active) : Math.max(a0, Math.ceil((2 * n) / 3) - 1));
  const over = (from: number, to: number, f: number) => from + Math.min(to - from, Math.floor(Math.max(0, f) * (to - from + 1)));
  if (t < m.startup) return a0 === 0 ? 0 : over(0, a0 - 1, t / m.startup);
  if (t < m.startup + m.active) return over(a0, a1, (t - m.startup) / m.active);
  if (a1 === n - 1 || m.recovery === 0) return a1;
  return over(a1 + 1, n - 1, (t - m.startup - m.active) / m.recovery);
}
