import { defineSystem, type Entity, type SimCtx } from '@gg/sdk';
import { ORDER_LEFT } from './carry.js';

/** How long an order was given at first, on a dropoff's props (the view drains the bubble against it). */
export const ORDER_MAX = 'orderMax';
/** What a dropoff asks for, on its props (the view draws it in the bubble). */
export const ORDER_TYPE = 'orderType';
/** The tick a dropoff may ask again after an order is filled or missed, on its props. */
export const REST_UNTIL = 'restUntil';
/** Ticks of an order left when it starts to hurry the player (the bubble flashes, a tick sounds). */
export const HURRY_TICKS = 180;

interface OrdersState {
  /** The tick the next order comes. */
  next: number;
  /**
   * Dropoffs whose order ran out this tick. A delivery the carry system took earlier in the same tick still fills it
   * (it saw the order open); the rest are missed at the start of the next tick.
   */
  due: number[];
  filled: number;
  missed: number;
}

const num = (ctx: Pick<SimCtx, 'params'>, k: string, d: number) => {
  const v = Number(ctx.params[k]);
  return Number.isFinite(v) ? v : d;
};

/** A level's difficulty, from its ramp (0 when it has none). */
const difficulty = (ctx: Pick<SimCtx, 'map'>) => Math.max(0, Math.min(1, ctx.map.level.ramp?.difficulty ?? 0));

/**
 * The timing of a level's orders: how long one waits and how often a new one comes, both a fifth longer than set on an
 * easy level and a fifth shorter on the hardest.
 */
export function orderTiming(ctx: Pick<SimCtx, 'params' | 'map'>): { patience: number; every: number; first: number } {
  const scale = 1.2 - 0.4 * difficulty(ctx);
  return {
    patience: Math.round(num(ctx, 'patienceS', 15) * 60 * scale),
    every: Math.round(num(ctx, 'everyS', 6) * 60 * scale),
    first: Math.round(num(ctx, 'firstS', 2) * 60),
  };
}

/** The game's dropoffs and what they are handed: the carry system's names for them. */
function names(ctx: Pick<SimCtx, 'paramsOf'>): { dropoff: string; cargo: string } {
  const carry = ctx.paramsOf('carry') ?? {};
  return { dropoff: String(carry['dropoffType'] ?? 'dropoff'), cargo: String(carry['cargoType'] ?? 'cargo') };
}

const asking = (e: Entity) => Number(e.props[ORDER_LEFT] ?? 0) > 0;

/** Closes a dropoff's order: it rests a while before it asks again. */
function close(e: Entity, ctx: SimCtx): void {
  e.props[ORDER_LEFT] = 0;
  e.props[REST_UNTIL] = ctx.tick + Math.round(num(ctx, 'restS', 2) * 60);
  e.anim = 'idle';
}

/** The customer walks out: the order closes, and it costs the player missDamage health, even right after another blow. */
function miss(s: OrdersState, e: Entity, ctx: SimCtx): void {
  close(e, ctx);
  s.missed++;
  ctx.emit('custom:order_missed', { entity: e.id, x: e.x, y: e.y, missed: s.missed });
  const p = ctx.world.player;
  const damage = Math.round(num(ctx, 'missDamage', 1));
  if (damage > 0 && p.alive) {
    p.invulnTicks = 0;
    ctx.damage(p, damage, null);
  }
}

/**
 * Timed orders, on the carry system's dropoffs: every so often (everyS, give or take a quarter) a free dropoff asks for
 * a delivery and waits patienceS seconds, while fewer than maxOpen wait. The bubble over it empties as the time runs,
 * and hurries the player in its last three seconds. Delivered in time: 10 points and a tip for the time left. Missed:
 * the customer walks out and it costs missDamage health, so a lives rule decides how many walkouts lose the level. Both
 * timings tighten on harder levels. A dropoff that asks for nothing takes nothing (the carry system turns it down).
 */
export const orders = defineSystem<OrdersState>({
  id: 'orders',
  init(ctx) {
    const { dropoff } = names(ctx);
    // Every dropoff starts with no order to fill.
    for (const e of ctx.world.entities) {
      if (e.type !== dropoff) continue;
      e.props[ORDER_LEFT] = 0;
      e.anim = 'idle';
    }
    return { next: orderTiming(ctx).first, due: [], filled: 0, missed: 0 };
  },
  fixedUpdate(s, _input, ctx) {
    const { dropoff, cargo } = names(ctx);
    const drops = ctx.world.entities.filter((e) => e.alive && e.type === dropoff);
    for (const id of s.due) {
      const e = drops.find((x) => x.id === id);
      if (e) miss(s, e, ctx);
    }
    s.due = [];
    for (const e of drops) {
      if (!asking(e)) continue;
      const left = Number(e.props[ORDER_LEFT]) - 1;
      e.props[ORDER_LEFT] = left;
      if (left === HURRY_TICKS) ctx.emit('custom:order_hurry', { entity: e.id, x: e.x, y: e.y });
      // Out of time: from now on the dropoff takes nothing.
      if (left <= 0) s.due.push(e.id);
    }
    const open = drops.filter((e) => asking(e) || s.due.includes(e.id)).length;
    if (ctx.tick < s.next || open >= Math.max(1, Math.round(num(ctx, 'maxOpen', 2)))) return;
    const free = drops.filter((e) => !asking(e) && !s.due.includes(e.id) && Number(e.props[REST_UNTIL] ?? 0) <= ctx.tick);
    // No dropoff free yet: the next order comes as soon as one is.
    if (free.length === 0) return;
    const e = free[ctx.rng.int(free.length)]!;
    const t = orderTiming(ctx);
    e.props[ORDER_LEFT] = t.patience;
    e.props[ORDER_MAX] = t.patience;
    e.props[ORDER_TYPE] = cargo;
    e.anim = 'wants';
    s.next = ctx.tick + Math.round(t.every * (0.75 + 0.5 * ctx.rng.float()));
    ctx.emit('custom:order', { entity: e.id, type: cargo, x: e.x, y: e.y, patience: t.patience });
  },
  onEvent(s, ev, ctx) {
    if (ev.name !== 'custom:deliver') return;
    const e = ctx.world.entities.find((x) => x.id === ev.payload['entity']);
    if (!e || !(asking(e) || s.due.includes(e.id))) return;
    s.due = s.due.filter((id) => id !== e.id);
    const left = Math.max(0, Number(e.props[ORDER_LEFT]));
    const tip = Math.round(num(ctx, 'tipMax', 10) * (left / Math.max(1, Number(e.props[ORDER_MAX] ?? 1))));
    ctx.world.score += 10 + tip;
    s.filled++;
    close(e, ctx);
    ctx.emit('custom:order_filled', { entity: e.id, x: e.x, y: e.y, tip, points: 10 + tip, filled: s.filled });
  },
  // Fewer walkouts is further along: the explorer keeps the runs that miss least.
  progress: (s) => 1 / (1 + s.missed),
});

export const meta = {
  id: 'orders',
  genres: ['freeform'],
  summary:
    "Timed orders on the carry system's dropoffs: every everyS seconds a free dropoff asks for a delivery and waits patienceS seconds (a bubble over it empties, hurrying the last three); deliver there in time for 10 points and a tip for the time left; a missed order costs missDamage health, so the lives rule decides how many walkouts lose (with a survive goal, make walkouts cost enough that standing still loses). At most maxOpen wait at once; both timings tighten on harder levels. Needs carry.",
  params: {
    everyS: { type: 'number', min: 2, max: 30, default: 6, affects: 'none' },
    firstS: { type: 'number', min: 0, max: 20, default: 2, affects: 'none' },
    patienceS: { type: 'number', min: 4, max: 60, default: 15, affects: 'none' },
    maxOpen: { type: 'number', min: 1, max: 6, default: 2, affects: 'none' },
    missDamage: { type: 'number', min: 0, max: 9, default: 1, affects: 'none' },
    restS: { type: 'number', min: 0, max: 10, default: 2, affects: 'none' },
    tipMax: { type: 'number', min: 0, max: 50, default: 10, affects: 'none' },
  },
  emits: ['custom:order', 'custom:order_hurry', 'custom:order_filled', 'custom:order_missed', 'hit', 'damage', 'death'],
  feedbackFor: ['custom:order', 'custom:order_hurry', 'custom:order_filled', 'custom:order_missed'],
  // Where carry goes: walking or running and jumping.
  requires: { movement: ['topdown', 'platformer'], systems: ['carry'], roles: ['dropoff'] },
} as const;
