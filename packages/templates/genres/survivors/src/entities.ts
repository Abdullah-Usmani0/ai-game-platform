import type { EntityDef } from '@gg/sdk';

export const ENTITY_DEFS: EntityDef[] = [
  { type: 'chaser', w: 8, h: 8, hp: 2, gravity: false, fsm: 'chaser', contactDamage: 1 },
  { type: 'brute', w: 12, h: 12, hp: 6, gravity: false, fsm: 'chaser', contactDamage: 2 },
  { type: 'xp', w: 4, h: 4, hp: 1, gravity: false, pickup: true },
];
export const PLAYER = { w: 8, h: 10, hp: 5 } as const;
export const COLLECTIBLE_TYPES = ['xp'];
