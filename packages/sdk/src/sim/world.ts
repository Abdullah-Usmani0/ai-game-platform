import type { ParamValue } from '@gg/schemas';
import type { Body } from './physics.js';

export interface FsmRuntime {
  id: string;
  state: string;
  enteredTick: number;
  cooldowns: Record<string, number>;
}

export interface Entity extends Body {
  id: number;
  type: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  gravity: boolean;
  isPlayer: boolean;
  isProjectile: boolean;
  /** Contact damage dealt to the player on overlap (0 = none). */
  contactDamage: number;
  pickup: boolean;
  anim: string;
  flags: Record<string, boolean>;
  props: Record<string, ParamValue>;
  fsm: FsmRuntime | null;
  invulnTicks: number;
  tookDamageTick: number;
  /** Visual-only squash/stretch scale, written by systems, read by the renderer. */
  scaleX: number;
  scaleY: number;
  /** Palette role the placeholder renderer draws this entity with (null: the renderer's default by kind). */
  tint: EntityTint | null;
}

/** Palette roles an entity type may ask the renderer for. */
export type EntityTint = 'foreground' | 'accent' | 'danger' | 'ui' | 'mid';

/** Static definition of an entity type (from the genre template or the sample game). */
export interface EntityDef {
  type: string;
  w: number;
  h: number;
  hp?: number;
  gravity?: boolean;
  fsm?: string;
  contactDamage?: number;
  pickup?: boolean;
  projectile?: boolean;
  /** Placeholder render colour by palette role, for items that are neither enemies nor plain pickups (relics, doors). */
  tint?: EntityTint;
}

export interface WorldFlags {
  paused: boolean;
  gameOver: boolean;
  won: boolean;
}

export interface World {
  levelId: string;
  entities: Entity[];
  player: Entity;
  nextId: number;
  hud: Record<string, number | string>;
  flags: WorldFlags;
  score: number;
  deaths: number;
  checkpoint: { x: number; y: number };
}

export function makeEntity(id: number, def: EntityDef, x: number, y: number): Entity {
  return {
    id,
    type: def.type,
    x,
    y,
    w: def.w,
    h: def.h,
    vx: 0,
    vy: 0,
    grounded: false,
    hitWall: false,
    hitCeiling: false,
    facing: 1,
    hp: def.hp ?? 1,
    maxHp: def.hp ?? 1,
    alive: true,
    gravity: def.gravity ?? true,
    isPlayer: false,
    isProjectile: def.projectile ?? false,
    contactDamage: def.contactDamage ?? 0,
    pickup: def.pickup ?? false,
    anim: 'idle',
    flags: {},
    props: {},
    fsm: def.fsm ? { id: def.fsm, state: '', enteredTick: 0, cooldowns: {} } : null,
    invulnTicks: 0,
    tookDamageTick: -1,
    scaleX: 1,
    scaleY: 1,
    tint: def.tint ?? null,
  };
}

export function centerX(e: { x: number; w: number }): number {
  return e.x + e.w / 2;
}

export function centerY(e: { y: number; h: number }): number {
  return e.y + e.h / 2;
}
