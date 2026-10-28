import { CELESTE_CLASS, type FeelPreset } from '@gg/sdk';

/** Softer, floatier: lower gravity, longer coyote, slower run. */
export const FLOATY_COZY: FeelPreset = { ...CELESTE_CLASS, id: 'floaty-cozy', maxRun: 70, runAccel: 700, gravity: 650, maxFall: 130, jumpSpeed: -95, varJumpTime: 0.24, coyoteTime: 0.14, jumpBufferTime: 0.12, dashSpeed: 200 };

/** Heavier, snappier: more gravity, shorter coyote, faster fall. */
export const HEAVY_RETRO: FeelPreset = { ...CELESTE_CLASS, id: 'heavy-retro', maxRun: 100, runAccel: 1400, runReduce: 600, gravity: 1200, maxFall: 220, jumpSpeed: -125, varJumpTime: 0.14, coyoteTime: 0.06, jumpBufferTime: 0.08, airMult: 0.5 };

export const FEEL: Record<string, FeelPreset> = { [CELESTE_CLASS.id]: CELESTE_CLASS, [FLOATY_COZY.id]: FLOATY_COZY, [HEAVY_RETRO.id]: HEAVY_RETRO };
export const DEFAULT_FEEL = CELESTE_CLASS.id;
