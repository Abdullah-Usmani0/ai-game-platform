import { CELESTE_CLASS, type FeelPreset } from '@gg/sdk';

/** Room-to-room melee feel: quick acceleration, a committed dash with a real cooldown, no gravity (topdown mode). */
export const ROOM_MELEE: FeelPreset = { ...CELESTE_CLASS, id: 'room-melee', maxRun: 95, runAccel: 1300, runReduce: 1000, gravity: 0, maxFall: 0, dashSpeed: 250, dashTime: 0.12, dashCooldown: 0.45 };
export const ROOM_HEAVY: FeelPreset = { ...ROOM_MELEE, id: 'room-heavy', maxRun: 75, runAccel: 800, runReduce: 600, dashSpeed: 210, dashCooldown: 0.7 };
export const FEEL: Record<string, FeelPreset> = { [ROOM_MELEE.id]: ROOM_MELEE, [ROOM_HEAVY.id]: ROOM_HEAVY };
export const DEFAULT_FEEL = ROOM_MELEE.id;
