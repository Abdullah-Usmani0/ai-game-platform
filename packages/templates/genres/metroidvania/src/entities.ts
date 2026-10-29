import type { EntityDef } from '@gg/sdk';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP, ENTITY_DEFS as PLATFORMER_DEFS, PLAYER as PLATFORMER_PLAYER } from '@gg/template-platformer';

export { ABILITY_DASH, ABILITY_DOUBLE_JUMP };
export const WINGS_TYPE = 'wings';
export const BOOTS_TYPE = 'boots';
/** Relic entity types and the ability flag each one grants on the player (the gated movement reads them). */
export const RELIC_ABILITY: Readonly<Record<string, string>> = { [WINGS_TYPE]: ABILITY_DOUBLE_JUMP, [BOOTS_TYPE]: ABILITY_DASH };
export const KEY_TYPE = 'key';
export const DOOR_TYPE = 'door';
/** Everything the relics system collects: the ability relics and keys. */
export const RELIC_TYPES: readonly string[] = [...Object.keys(RELIC_ABILITY), KEY_TYPE];
/** A door is three tiles tall: the tile at its entity position and the two above. Its tiles are solid in the level data. */
export const DOOR_TILES = 3;

export const ENTITY_DEFS: EntityDef[] = [
  ...PLATFORMER_DEFS,
  { type: 'wings', w: 8, h: 8, gravity: false, tint: 'accent' },
  { type: 'boots', w: 8, h: 8, gravity: false, tint: 'accent' },
  { type: KEY_TYPE, w: 6, h: 6, gravity: false, tint: 'ui' },
  { type: DOOR_TYPE, w: 8, h: 8 * DOOR_TILES, gravity: false, tint: 'ui' },
];

export const PLAYER = PLATFORMER_PLAYER;
export const COLLECTIBLE_TYPES = ['coin'];
