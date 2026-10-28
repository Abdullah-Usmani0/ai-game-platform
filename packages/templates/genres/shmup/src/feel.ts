import { CELESTE_CLASS, type FeelPreset } from '@gg/sdk';

/** Arcade ship: near-instant acceleration, a short sidestep dash with a real cooldown, no gravity (topdown mode). */
export const ARCADE_SHIP: FeelPreset = { ...CELESTE_CLASS, id: 'arcade-ship', maxRun: 130, runAccel: 2400, runReduce: 1800, gravity: 0, maxFall: 0, dashSpeed: 280, dashTime: 0.1, dashCooldown: 0.6 };
export const HEAVY_SHIP: FeelPreset = { ...ARCADE_SHIP, id: 'heavy-ship', maxRun: 100, runAccel: 1400, runReduce: 1200, dashSpeed: 220, dashCooldown: 0.9 };
export const FEEL: Record<string, FeelPreset> = { [ARCADE_SHIP.id]: ARCADE_SHIP, [HEAVY_SHIP.id]: HEAVY_SHIP };
export const DEFAULT_FEEL = ARCADE_SHIP.id;
