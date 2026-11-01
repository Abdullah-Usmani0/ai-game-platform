import type { ParamValue } from '@gg/schemas';
import type { Body } from './physics.js';

export interface FsmRuntime {
  id: string;
  state: string;
  enteredTick: number;
  cooldowns: Record<string, number>;
  /**
   * How many times the behaviour has entered a state, its first included: a new count is a new entry (enteredTick moves
   * on while timers hold, a hitstop or a menu, so it cannot tell). Absent until the first.
   */
  entries?: number;
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
  /**
   * Asleep: the sim neither moves it nor runs its behaviour (an enemy in a room the player is not in). Set by systems;
   * absent means awake.
   */
  dormant?: boolean;
  /** Its place in the level's entity list, for one the level placed: a save names the ones gone for good by it. */
  levelIndex?: number;
  /**
   * Staggered by a blow: while above zero its behaviour holds (no transition, no update) and its body slides to a stop.
   * Set by a combat system, counted down by the sim; absent means steady.
   */
  stunTicks?: number;
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
  /** The shipped type whose art it is drawn with: a type a game renamed (a freeform game's wasp) keeps its archetype's look. */
  drawAs?: string;
  /** Someone to talk to: no behaviour and no harm (sets flags.npc; a talk system opens their dialogue). */
  npc?: boolean;
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

/**
 * The talk being read (opened by a system through ctx.openDialogue). While one is open the world holds still, as for a
 * menu: action or jump shows the whole line, then goes on to the next; a node's answers open as a menu.
 */
export interface DialogueState {
  /** The node being read, who says it (a cast id, or `narrator`) and their name as shown. */
  node: string;
  speaker: string;
  name: string;
  lines: string[];
  /** The line being read, and how many of its characters show so far (the typewriter, counted in the sim). */
  line: number;
  shown: number;
  openedTick: number;
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

/** How the story ended (Sim.end): the ending reached, its place among the game's endings, and the quests done. */
export interface WorldEnding {
  id: string;
  title: string;
  /** Its place among the game's endings, from 1, and how many there are. */
  index: number;
  count: number;
  quests: { done: number; total: number };
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
  /** The talk being read, if any (opened by a system through ctx.openDialogue). Absent until one first opens. */
  dialogue?: DialogueState | null;
  /**
   * The entities the level placed that are gone for good, by levelIndex (picked up, opened, a boss beaten: see staysGone).
   * Kept after the sim drops them, and given back by a resume, so every save names them all.
   */
  gone?: number[];
  /**
   * When the level last loaded again from a save (ctx.reloadFrom), and whether the player had fallen then (a death that
   * returns them to their last rest) or not (a rest). Absent until it first does. The view settles on it.
   */
  reloaded?: { tick: number; fromDeath: boolean };
  /**
   * Ticks the world holds still as a heavy blow lands (set by a combat system): no system or body steps and timers hold,
   * while the inputs are still logged. Absent means none.
   */
  hitstop?: number;
  /** The ending the game closed on (Sim.end), for the results. Absent until the game ends. */
  ending?: WorldEnding | null;
}

/**
 * Whether a dead entity the level placed stays gone when the level loads again from a save: everything but the enemies
 * that come back (an entity with a behaviour or contact damage), and a beaten boss stays beaten.
 */
export function staysGone(e: Pick<Entity, 'flags' | 'fsm' | 'contactDamage'>): boolean {
  return e.flags['boss'] === true || (e.fsm === null && e.contactDamage <= 0);
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
    flags: { ...(def.boss ? { boss: true } : {}), ...(def.npc ? { npc: true } : {}) },
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
