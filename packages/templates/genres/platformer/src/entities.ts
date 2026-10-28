import type { EntityDef } from '@gg/sdk';

export const ENTITY_DEFS: EntityDef[] = [
  { type: 'walker', w: 8, h: 8, hp: 1, gravity: true, fsm: 'walker', contactDamage: 1 },
  { type: 'hopper', w: 8, h: 8, hp: 1, gravity: true, fsm: 'hopper', contactDamage: 1 },
  { type: 'turret', w: 8, h: 8, hp: 2, gravity: true, fsm: 'turret', contactDamage: 1 },
  { type: 'bolt', w: 4, h: 4, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
  { type: 'coin', w: 6, h: 6, hp: 1, gravity: false, pickup: true },
];

export const PLAYER = { w: 8, h: 11, hp: 3 } as const;
export const COLLECTIBLE_TYPES = ['coin'];
