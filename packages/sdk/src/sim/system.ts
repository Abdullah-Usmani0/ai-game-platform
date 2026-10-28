import type { GameEventRecord, ParamValue } from '@gg/schemas';
import type { EventBus } from './events.js';
import type { FeelPreset } from './feel.js';
import type { InputState } from './input.js';
import type { Rng } from './rng.js';
import type { Tilemap } from './tilemap.js';
import type { Entity, World } from './world.js';

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
  emit(name: string, payload?: Record<string, unknown>): void;
  spawn(type: string, x: number, y: number): Entity;
  damage(target: Entity, amount: number, source: Entity | null): void;
  respawnPlayer(): void;
  /** Physics helper: move a body with tile collisions. */
  move(e: Entity, dx: number, dy: number): void;
}

export interface SystemDef<S> {
  id: string;
  init(ctx: SimCtx): S;
  fixedUpdate(state: S, input: InputState, ctx: SimCtx): void;
  onEvent?(state: S, ev: GameEventRecord, ctx: SimCtx): void;
}

/** Author a simulation system. Pure data in, pure data out; the only API GlueTS code sees. */
export function defineSystem<S>(def: SystemDef<S>): SystemDef<S> {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(def.id)) throw new Error(`invalid system id '${def.id}'`);
  return def;
}
