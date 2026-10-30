import type { GameEventRecord, ParamValue } from '@gg/schemas';
import type { EventBus } from './events.js';
import type { FeelPreset } from './feel.js';
import type { InputState } from './input.js';
import type { Rng } from './rng.js';
import type { Tilemap } from './tilemap.js';
import type { Entity, EntityDef, MenuOption, World } from './world.js';

/** What a system asks for when it opens a menu (ctx.openMenu). */
export interface MenuSpec {
  id: string;
  title: string;
  /** One to four options; more are cut. */
  options: MenuOption[];
  /** The dash key closes the menu without a choice (default false). */
  cancellable?: boolean;
  /** The option highlighted first (default the first one that is not disabled). */
  selected?: number;
}

/** Everything a system may touch. Nothing else exists for simulation code. */
export interface SimCtx {
  readonly tick: number;
  /** Fixed step in seconds (1/60). */
  readonly dt: number;
  readonly rng: Rng;
  readonly events: EventBus;
  readonly world: World;
  readonly map: Tilemap;
  readonly feel: FeelPreset;
  /** This system's parameters from systems.json (typed loosely; validate in init). */
  readonly params: Readonly<Record<string, ParamValue>>;
  /**
   * Another system's parameters (empty when it has none set), or undefined when the game does not run that system. For
   * a rule that follows the game's other rules: a farm season's gold target depends on how long a day lasts and how
   * many seeds a pack holds.
   */
  paramsOf(systemId: string): Readonly<Record<string, ParamValue>> | undefined;
  /** Content JSON (waves, dialogue, progression) the game ships with. */
  readonly content: Readonly<Record<string, unknown>>;
  readonly movementMode: 'platformer' | 'topdown';
  /** The definition of an entity type (what it is, even once its last entity is gone), or undefined for an unknown type. */
  defOf(type: string): Readonly<EntityDef> | undefined;
  emit(name: string, payload?: Record<string, unknown>): void;
  spawn(type: string, x: number, y: number): Entity;
  damage(target: Entity, amount: number, source: Entity | null): void;
  respawnPlayer(): void;
  /** Physics helper: move a body with tile collisions. */
  move(e: Entity, dx: number, dy: number): void;
  /**
   * Open a menu (boons, upgrades, a shop). The world freezes (systems, entities and behaviour timers stop) until the
   * player moves the highlight with the arrows and picks with action or jump, which emits
   * menu_choose { menu, option, index }; a cancellable menu also closes on dash with option null. Picks are ignored
   * for MENU_GRACE_TICKS after opening, so a held or mashed key never chooses unread. Replaces an open menu.
   */
  openMenu(menu: MenuSpec): void;
}

export interface SystemDef<S> {
  id: string;
  init(ctx: SimCtx): S;
  fixedUpdate(state: S, input: InputState, ctx: SimCtx): void;
  onEvent?(state: S, ev: GameEventRecord, ctx: SimCtx): void;
  /**
   * How close this system's win condition is, from 0 to 1 (kills of the total, time survived, crates placed). Bots and
   * analytics read it; it never changes the game. The universal explorer bot steers by it.
   */
  progress?(state: S, ctx: SimCtx): number;
  /**
   * The longest a level can last under this system's rules, in ticks, for rules that take longer than the 90 seconds
   * every level gets: a survival of fifteen minutes, a farm season of days. Tooling reads it (solver runs and proofs
   * stop there); it never changes the game.
   */
  levelTicks?(ctx: Pick<SimCtx, 'params' | 'paramsOf' | 'content'>): number;
}

/** Author a simulation system. Pure data in, pure data out; the only API GlueTS code sees. */
export function defineSystem<S>(def: SystemDef<S>): SystemDef<S> {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(def.id)) throw new Error(`invalid system id '${def.id}'`);
  return def;
}
