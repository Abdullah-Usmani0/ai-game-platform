import { CELESTE_CLASS, type FeelPreset } from '@gg/sdk';

/**
 * Grid puzzles have no physics: these presets only satisfy the runtime contract (topdown mode, no gravity). Step
 * timing, key repeat and undo live in the grid-push system's params, where the parameter panels tune them.
 */
export const GRID_SNAPPY: FeelPreset = { ...CELESTE_CLASS, id: 'grid-snappy', gravity: 0, maxFall: 0 };
export const GRID_CALM: FeelPreset = { ...GRID_SNAPPY, id: 'grid-calm' };
export const FEEL: Record<string, FeelPreset> = { [GRID_SNAPPY.id]: GRID_SNAPPY, [GRID_CALM.id]: GRID_CALM };
export const DEFAULT_FEEL = GRID_SNAPPY.id;
