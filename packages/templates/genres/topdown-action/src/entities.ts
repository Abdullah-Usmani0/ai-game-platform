import type { EntityDef } from '@gg/sdk';

export const ENTITY_DEFS: EntityDef[] = [
  // Hostiles do not hurt by touch: grunts and brutes bite after a telegraphed wind-up, archers shoot.
  { type: 'grunt', w: 8, h: 8, hp: 2, gravity: false, fsm: 'grunt', contactDamage: 0 },
  { type: 'archer', w: 8, h: 8, hp: 2, gravity: false, fsm: 'archer', contactDamage: 0 },
  { type: 'brute', w: 12, h: 12, hp: 6, gravity: false, fsm: 'brute', contactDamage: 0 },
  { type: 'arrow', w: 4, h: 4, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
  { type: 'gem', w: 5, h: 5, hp: 1, gravity: false, pickup: true },
];
export const PLAYER = { w: 8, h: 10, hp: 7 } as const;
export const COLLECTIBLE_TYPES = ['gem'];
export const HOSTILE_TYPES = ['grunt', 'archer', 'brute'];

/** A hostile is any living non-player entity that is neither a pickup nor a projectile. */
export const isHostile = (e: { isPlayer: boolean; alive: boolean; pickup: boolean; isProjectile: boolean }): boolean => !e.isPlayer && e.alive && !e.pickup && !e.isProjectile;
