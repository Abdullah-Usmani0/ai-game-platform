import { CELESTE_CLASS, type FeelPreset } from '@gg/sdk';

/** An unhurried walk between the beds: gentle starts and stops, no gravity (topdown mode), a short hop of a dash. */
export const FARM_STROLL: FeelPreset = { ...CELESTE_CLASS, id: 'farm-stroll', maxRun: 62, runAccel: 700, runReduce: 800, gravity: 0, maxFall: 0, dashSpeed: 150, dashTime: 0.1, dashCooldown: 0.8 };
export const FARM_BRISK: FeelPreset = { ...FARM_STROLL, id: 'farm-brisk', maxRun: 80, runAccel: 950, runReduce: 1000 };
export const FEEL: Record<string, FeelPreset> = { [FARM_STROLL.id]: FARM_STROLL, [FARM_BRISK.id]: FARM_BRISK };
export const DEFAULT_FEEL = FARM_STROLL.id;
