import { CASTLE_AGILE, CASTLE_WEIGHTY, type FeelPreset } from '@gg/sdk';

/**
 * The castle tier's feels on 16 px tiles: agile (a quick hero, a jump of three and a half tiles) and weighty (slower,
 * lower and committal). Every gate the region generator builds holds under both.
 */
export const FEEL: Record<string, FeelPreset> = { [CASTLE_AGILE.id]: CASTLE_AGILE, [CASTLE_WEIGHTY.id]: CASTLE_WEIGHTY };
export const DEFAULT_FEEL = CASTLE_AGILE.id;
