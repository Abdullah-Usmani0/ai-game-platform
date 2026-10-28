import type { InputState } from '../sim/input.js';
import { TICK_RATE, type Sim } from '../sim/sim.js';

export type RunMode = 'manual' | 'realtime';
export type InputProvider = (tick: number) => InputState;

const STEP_MS = 1000 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 8;
const MAX_FRAME_MS = 250;

/**
 * Advances the sim. `realtime` consumes wall-clock deltas with a fixed-step accumulator;
 * `manual` never advances on its own, only through step(). Both produce identical
 * sims for identical per-tick input, which is what the replay-hash test proves.
 */
export class Driver {
  private acc = 0;
  constructor(
    public readonly sim: Sim,
    public mode: RunMode,
    public input: InputProvider,
  ) {}

  /** Called from the render loop with the frame delta in ms. Returns steps taken (never more than `limit`). */
  frame(deltaMs: number, limit = Infinity): number {
    if (this.mode !== 'realtime') return 0;
    this.acc += Math.min(deltaMs, MAX_FRAME_MS);
    let steps = 0;
    while (this.acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME && steps < limit) {
      this.sim.step(this.input(this.sim.tick));
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    return steps;
  }

  /** Explicit stepping; allowed in both modes (tests use it in manual mode). */
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.sim.step(this.input(this.sim.tick));
  }

  advanceTime(ms: number): void {
    this.step(Math.round(ms / STEP_MS));
  }
}
