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
  /** Palette role the renderer draws this entity with when its type has no sprite recipe (null: chosen by kind). */
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
  /** A boss: the renderer shows its health bar, and melee knockback barely moves it (sets flags.boss). */
  boss?: boolean;
}

export interface WorldFlags {
  paused: boolean;
  gameOver: boolean;
  won: boolean;
}

/** One choice on an in-game menu: a boon, an upgrade, a shop item. */
export interface MenuOption {
  id: string;
  label: string;
  /** A short sentence under the label. */
  detail?: string;
  /** HUD icon drawn on the card: heart, bolt, star, coin, gem, clock, foot, skull, key... */
  icon?: string;
  /** Shown on the card as a price; what choosing it costs is up to the system that opened the menu. */
  cost?: number;
  /** Shown greyed out; the selection skips it and it cannot be chosen. */
  disabled?: boolean;
}

/** An open menu. While one is open the world holds still: no system, entity or timer advances. */
export interface Menu {
  id: string;
  title: string;
  options: MenuOption[];
  selected: number;
  openedTick: number;
  /** The dash key closes it without a choice. */
  cancellable: boolean;
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
  /** The open menu, if any (opened by a system through ctx.openMenu). */
  menu: Menu | null;
}

/**
 * The one rule for what a system may fight, whichever genre it or the entity comes from: a living entity that has a
 * behaviour or deals contact damage, and is neither the player, a pickup nor a projectile. Top-down action enemies hurt
 * by what they do (a bite, an arrow), not by touch, and are hostile all the same.
 */
export function isHostile(e: Pick<Entity, 'isPlayer' | 'alive' | 'pickup' | 'isProjectile' | 'fsm' | 'contactDamage'>): boolean {
  return !e.isPlayer && e.alive && !e.pickup && !e.isProjectile && (e.fsm !== null || e.contactDamage > 0);
}

/** Whether a type is hostile by its definition (the same rule, for a type whose entities may be gone). */
export function isHostileDef(def: Readonly<EntityDef> | undefined): boolean {
  return def !== undefined && !def.pickup && !def.projectile && (def.fsm !== undefined || (def.contactDamage ?? 0) > 0);
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
    flags: def.boss ? { boss: true } : {},
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
