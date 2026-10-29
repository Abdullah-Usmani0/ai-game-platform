export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  dash: boolean;
  action: boolean;
  pause: boolean;
}

export const INPUT_KEYS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'action', 'pause'] as const;
export type InputKey = (typeof INPUT_KEYS)[number];

export function emptyInput(): InputState {
  return { left: false, right: false, up: false, down: false, jump: false, dash: false, action: false, pause: false };
}

export function inputEquals(a: InputState, b: InputState): boolean {
  for (const k of INPUT_KEYS) if (a[k] !== b[k]) return false;
  return true;
}

/** A change-point input log: the input in force from `tick` until the next entry. */
export interface InputFrame {
  tick: number;
  input: InputState;
}

/** A scripted input segment for bots and replay tests: holds `input` for ticks [from, to). */
export interface InputSegment {
  from: number;
  to: number;
  input: Partial<InputState>;
}

export function inputAtTick(script: readonly InputSegment[], tick: number): InputState {
  const state = emptyInput();
  for (const seg of script) {
    if (tick >= seg.from && tick < seg.to) Object.assign(state, seg.input);
  }
  return state;
}

/**
 * The same run with no segment that holds for no tick (where two frames share a tick, the later one is in force) and
 * neighbours holding the same keys merged: `inputAtTick` gives the same input at every tick, and a recorded proof stays
 * within the schema.
 */
export function compactScript(script: readonly InputSegment[]): InputSegment[] {
  const out: InputSegment[] = [];
  for (const seg of script) {
    if (seg.to <= seg.from) continue;
    const last = out[out.length - 1];
    if (last && last.to === seg.from && inputEquals({ ...emptyInput(), ...last.input }, { ...emptyInput(), ...seg.input })) last.to = seg.to;
    else out.push({ from: seg.from, to: seg.to, input: { ...seg.input } });
  }
  return out;
}

export function logToScript(log: readonly InputFrame[], endTick: number): InputSegment[] {
  const out: InputSegment[] = [];
  for (let i = 0; i < log.length; i++) {
    const frame = log[i];
    if (!frame) continue;
    const next = log[i + 1];
    out.push({ from: frame.tick, to: next ? next.tick : endTick, input: { ...frame.input } });
  }
  return out;
}
