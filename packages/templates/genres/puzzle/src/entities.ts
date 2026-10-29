import type { EntityDef } from '@gg/sdk';
import { CRATE_TYPE, TARGET_TYPE } from './puzzle.js';

export { CRATE_TYPE, TARGET_TYPE };

/** Crates are pushed one tile at a time; targets are floor marks under them. Neither hurts, falls or is picked up. */
export const ENTITY_DEFS: EntityDef[] = [
  { type: TARGET_TYPE, w: 10, h: 10, hp: 1, gravity: false, contactDamage: 0, tint: 'ui' },
  { type: CRATE_TYPE, w: 14, h: 14, hp: 1, gravity: false, contactDamage: 0, tint: 'accent' },
];
export const PLAYER = { w: 12, h: 12, hp: 1 } as const;
export const COLLECTIBLE_TYPES: string[] = [];
