import type { Objectives } from '@gg/schemas';
import { defineSystem, type Entity, type SimCtx } from '@gg/sdk';

/** The cargo type the player holds, on the player's props (nothing rides along: the view draws it over the head). */
export const CARRYING = 'carrying';
/** The tick a source has its next item ready, on the source's props. */
export const READY_AT = 'readyAt';
/** Ticks an open order has left, on a dropoff's props, while the game runs timed orders (and 0 with none open). */
export const ORDER_LEFT = 'orderLeft';

/** The keys carrying can be set to: action by default; jump in a top-down game (it does not jump), down in a side view. */
export const CARRY_KEYS = ['action', 'jump', 'down'] as const;
export type CarryKey = (typeof CARRY_KEYS)[number];

interface CarryState {
  /** The key was held last tick (a press is a new hold). */
  prev: boolean;
  /** The last tick this system ran: a gap is a menu or a pause, after which a key still held is no press. */
  lastTick: number;
  delivered: number;
}

/** The game's names for the three parts of the job (the roster may rename them). */
export function carryTypes(ctx: Pick<SimCtx, 'params'>): { cargo: string; source: string; dropoff: string } {
  return { cargo: String(ctx.params['cargoType'] ?? 'cargo'), source: String(ctx.params['sourceType'] ?? 'source'), dropoff: String(ctx.params['dropoffType'] ?? 'dropoff') };
}

/** The gap between two boxes in pixels: 0 when they touch or overlap. */
export function boxGap(a: Pick<Entity, 'x' | 'y' | 'w' | 'h'>, b: Pick<Entity, 'x' | 'y' | 'w' | 'h'>): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Whether the game runs timed orders: then a dropoff takes cargo only while it asks for it. */
export const ordersOn = (ctx: Pick<SimCtx, 'paramsOf'>): boolean => ctx.paramsOf('orders') !== undefined;

const orderLeft = (e: Entity): number => Number(e.props[ORDER_LEFT] ?? 0);
const ready = (e: Entity, tick: number): boolean => Number(e.props[READY_AT] ?? 0) <= tick;

export interface CarryTarget {
  e: Entity;
  kind: 'dropoff' | 'cargo' | 'source';
}

/**
 * What the key acts on now. Carrying: the dropoff in reach whose order runs out first, else any dropoff in reach (which
 * turns the delivery down while the game runs orders and it asks for none). Empty-handed: cargo lying in reach, else a
 * source in reach (which has nothing to give until its next item is made). Nearest first among equals.
 */
export function carryTarget(ctx: Pick<SimCtx, 'world' | 'params' | 'paramsOf' | 'tick'>): CarryTarget | null {
  const p = ctx.world.player;
  const types = carryTypes(ctx);
  const reach = Number(ctx.params['reach'] ?? 6);
  const inReach = (type: string) =>
    ctx.world.entities
      .filter((e) => e.alive && !e.isPlayer && e.type === type && boxGap(p, e) <= reach)
      .sort((a, b) => boxGap(p, a) - boxGap(p, b) || a.id - b.id);
  if (p.props[CARRYING] !== undefined) {
    const drops = inReach(types.dropoff);
    const asking = ordersOn(ctx) ? drops.filter((e) => orderLeft(e) > 0).sort((a, b) => orderLeft(a) - orderLeft(b) || a.id - b.id) : [];
    const e = asking[0] ?? drops[0];
    return e ? { e, kind: 'dropoff' } : null;
  }
  const lying = inReach(types.cargo)[0];
  if (lying) return { e: lying, kind: 'cargo' };
  const source = inReach(types.source).sort((a, b) => Number(ready(b, ctx.tick)) - Number(ready(a, ctx.tick)))[0];
  return source ? { e: source, kind: 'source' } : null;
}

/** The deliveries a level asks for: its objectives' goal on 'delivered', else ten. */
export function deliveriesWanted(ctx: Pick<SimCtx, 'content'>): number {
  const o = ctx.content['objectives'] as Partial<Objectives> | undefined;
  for (const c of o?.win?.clauses ?? []) if (c.kind === 'hud_at_least' && c.key === 'delivered' && c.value > 0) return c.value;
  return 10;
}

/** Closeness to the nearest of some entities, from 1 (touching) toward 0 (far away). */
function closeness(p: Entity, to: readonly Entity[]): number {
  let best = Infinity;
  for (const e of to) best = Math.min(best, boxGap(p, e));
  return best === Infinity ? 0 : 1 / (1 + best / 48);
}

/** Puts the held cargo down at the player's feet (or in front, `ahead` px) as an entity anyone can pick up again. */
function putDown(ctx: SimCtx, ahead: number, why: 'put' | 'hit' | 'fall'): void {
  const p = ctx.world.player;
  const type = p.props[CARRYING];
  if (type === undefined) return;
  delete p.props[CARRYING];
  ctx.world.hud['_carry'] = 0;
  const def = ctx.defOf(String(type));
  if (!def) return;
  const x = p.x + p.w / 2 - def.w / 2 + ahead * p.facing;
  const e = ctx.spawn(String(type), x, p.y + p.h - def.h);
  ctx.emit('custom:drop', { entity: e.id, type: e.type, x: e.x, y: e.y, why });
}

/**
 * Carry and deliver: the key picks up what is in reach (cargo lying about, or a source's next item once it is made)
 * and hands it over at a dropoff. One thing at a time, held over the head; with nothing in reach the key puts it down
 * in front. A hit knocks it to the floor, and so does a fall. While the game runs timed orders, a dropoff takes cargo
 * only when it asks for some. Every delivery counts on the HUD (`delivered`), for a goal to count.
 */
export const carry = defineSystem<CarryState>({
  id: 'carry',
  init(ctx) {
    ctx.world.hud['delivered'] = 0;
    ctx.world.hud['_carry'] = 0;
    return { prev: false, lastTick: -2, delivered: 0 };
  },
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    const key = (CARRY_KEYS as readonly string[]).includes(String(ctx.params['key'])) ? (String(ctx.params['key']) as CarryKey) : 'action';
    const held = input[key];
    // After a menu or a pause this system did not see, a key still held from it is not a new press.
    const pressed = held && !s.prev && ctx.tick === s.lastTick + 1;
    s.prev = held;
    s.lastTick = ctx.tick;
    const types = carryTypes(ctx);
    const makeTicks = Math.round(Number(ctx.params['makeS'] ?? 0.8) * 60);
    // A source shows its next item once it is made.
    for (const e of ctx.world.entities) if (e.alive && e.type === types.source) e.anim = ready(e, ctx.tick) ? 'ready' : 'idle';
    const target = p.alive ? carryTarget(ctx) : null;
    for (const e of ctx.world.entities) if (e.flags['reach'] && e !== target?.e) e.flags['reach'] = false;
    if (target) target.e.flags['reach'] = true;
    if (!p.alive || !pressed) return;
    if (!target) {
      // Nothing in reach: what is held goes down in front.
      putDown(ctx, 6, 'put');
      return;
    }
    const t = target.e;
    if (target.kind === 'dropoff') {
      if (ordersOn(ctx) && orderLeft(t) <= 0) {
        ctx.emit('custom:no_order', { entity: t.id, x: t.x, y: t.y });
        return;
      }
      const type = String(p.props[CARRYING]);
      delete p.props[CARRYING];
      ctx.world.hud['_carry'] = 0;
      s.delivered++;
      ctx.world.hud['delivered'] = s.delivered;
      ctx.emit('custom:deliver', { entity: t.id, type, x: t.x, y: t.y, delivered: s.delivered });
      return;
    }
    if (target.kind === 'cargo') {
      t.alive = false;
      ctx.emit('despawn', { entity: t.id, type: t.type });
    } else if (!ready(t, ctx.tick)) {
      ctx.emit('custom:not_ready', { entity: t.id, x: t.x, y: t.y });
      return;
    } else {
      t.props[READY_AT] = ctx.tick + makeTicks;
      t.anim = 'idle';
    }
    p.props[CARRYING] = types.cargo;
    ctx.world.hud['_carry'] = 1;
    ctx.emit('custom:lift', { entity: t.id, type: types.cargo, x: t.x, y: t.y, from: target.kind });
  },
  onEvent(_s, ev, ctx) {
    const p = ctx.world.player;
    if (p.props[CARRYING] === undefined) return;
    // A blow from something knocks what is held to the floor (a missed order's strike comes from nothing).
    if (ev.name === 'hit' && ev.payload['target'] === p.id && ev.payload['source'] !== null) putDown(ctx, 0, 'hit');
    else if (ev.name === 'death' && ev.payload['entity'] === p.id) putDown(ctx, 0, 'fall');
  },
  // How far along the deliveries are, with the leg under way: going for cargo, then taking it where it is asked for.
  progress(s, ctx) {
    const p = ctx.world.player;
    const types = carryTypes(ctx);
    const live = (type: string) => ctx.world.entities.filter((e) => e.alive && !e.isPlayer && e.type === type);
    let phase: number;
    if (p.props[CARRYING] !== undefined) {
      const drops = live(types.dropoff);
      const asking = ordersOn(ctx) ? drops.filter((e) => orderLeft(e) > 0) : drops;
      phase = 0.5 + 0.5 * closeness(p, asking.length ? asking : drops);
    } else {
      phase = 0.5 * closeness(p, [...live(types.cargo), ...live(types.source).filter((e) => ready(e, ctx.tick))]);
    }
    return Math.min(1, (s.delivered + phase) / deliveriesWanted(ctx));
  },
});

export const meta = {
  id: 'carry',
  genres: ['freeform'],
  summary:
    'Carry and deliver: the key picks up what is in reach (cargo lying about, or the next item a source makes, every makeS seconds) and hands it over at a dropoff, one at a time, held over the head; with nothing in reach it puts it down. A hit knocks it to the floor. With timed orders a dropoff takes cargo only when it asks. Counts deliveries on the HUD (delivered); a goal is hud_at_least delivered.',
  params: {
    key: { type: 'string', values: ['action', 'jump', 'down'], default: 'action', affects: 'none', valuesWith: { platformer: ['action', 'down'], topdown: ['action', 'jump'] } },
    reach: { type: 'number', min: 2, max: 16, default: 6, affects: 'none' },
    makeS: { type: 'number', min: 0, max: 5, default: 0.8, affects: 'none' },
    dropoffs: { type: 'number', min: 1, max: 6, default: 3, affects: 'levels' },
    cargoType: { type: 'string', default: 'cargo', affects: 'none', composed: 'entity' },
    sourceType: { type: 'string', default: 'source', affects: 'none', composed: 'entity' },
    dropoffType: { type: 'string', default: 'dropoff', affects: 'none', composed: 'entity' },
  },
  emits: ['custom:lift', 'custom:deliver', 'custom:drop', 'custom:no_order', 'custom:not_ready', 'despawn', 'spawn'],
  feedbackFor: ['custom:lift', 'custom:deliver', 'custom:drop', 'custom:no_order', 'custom:not_ready'],
  controls: { action: 'carry', jump: 'carry', down: 'carry' },
  controlGates: { action: { param: 'key', values: ['action'] }, jump: { param: 'key', values: ['jump'] }, down: { param: 'key', values: ['down'] } },
  provides: { spawns: ['cargo'] },
  // Walking or running and jumping; a puzzle's grid moves would turn its stations into walls on the board.
  requires: { movement: ['topdown', 'platformer'], roles: ['cargo', 'source', 'dropoff'] },
  hud: ['delivered'],
} as const;
