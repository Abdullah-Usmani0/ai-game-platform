import { CELESTE_CLASS, type FeelPreset } from '@gg/sdk';

/** Top-down arena feel: fast acceleration, no gravity (ignored in topdown mode), snappy dash. */
export const ARENA_MELEE: FeelPreset = { ...CELESTE_CLASS, id: 'arena-melee', maxRun: 110, runAccel: 1400, runReduce: 900, gravity: 0, maxFall: 0, dashSpeed: 260, dashTime: 0.12, dashCooldown: 0.5 };
export const ARENA_HEAVY: FeelPreset = { ...ARENA_MELEE, id: 'arena-heavy', maxRun: 85, runAccel: 900, runReduce: 600, dashSpeed: 220 };
export const FEEL: Record<string, FeelPreset> = { [ARENA_MELEE.id]: ARENA_MELEE, [ARENA_HEAVY.id]: ARENA_HEAVY };
export const DEFAULT_FEEL = ARENA_MELEE.id;
