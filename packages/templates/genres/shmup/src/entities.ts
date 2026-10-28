import type { EntityDef } from '@gg/sdk';

export const ENTITY_DEFS: EntityDef[] = [
  { type: 'drone', w: 8, h: 8, hp: 2, gravity: false, fsm: 'drone', contactDamage: 1 },
  { type: 'tank', w: 12, h: 12, hp: 6, gravity: false, fsm: 'tank', contactDamage: 1 },
  { type: 'bullet', w: 4, h: 4, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
  { type: 'shot', w: 3, h: 6, hp: 1, gravity: false, projectile: true, contactDamage: 0 },
  { type: 'power', w: 6, h: 6, hp: 1, gravity: false, fsm: 'drift', pickup: true },
];
export const PLAYER = { w: 8, h: 8, hp: 3 } as const;
export const COLLECTIBLE_TYPES = ['power'];
export const HOSTILE_TYPES = ['drone', 'tank'];
