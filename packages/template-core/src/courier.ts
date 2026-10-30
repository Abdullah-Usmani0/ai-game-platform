import { emptyInput, type Entity, type Sim } from '@gg/sdk';
import type { BotPolicy } from './manifest.js';
import { runToward, walkToward } from './navigate.js';
import { boxGap, CARRY_KEYS, CARRYING, carryTypes, ORDER_LEFT, ordersOn, READY_AT, type CarryKey } from './systems/carry.js';

/**
 * The courier: the bot that plays a carry-and-deliver job the way a good player does. Empty-handed it goes for the
 * nearest cargo lying about or the nearest source with an item made (or waits at a source until it is); carrying, it
 * takes it to the dropoff whose order runs out first (or the nearest, with no orders in the game), and waits there
 * when none asks yet. It presses the carry key once the thing it wants is in reach.
 *
 * Top-down it walks a shortest path, at its own size, to a spot beside its target. Side view it heads for the target's
 * column and jumps at walls, pits, hazards and foes ahead, and when the target stands above it; coming down, it steers
 * to land on solid ground; a stall turns it round for a moment with a jump.
 */

interface Job {
  e: Entity;
  /** Act on it (it is in reach): pick up or hand over. */
  act: boolean;
}

const live = (sim: Sim, type: string) => sim.world.entities.filter((e) => e.alive && !e.isPlayer && e.type === type);
const nearest = (p: Entity, es: readonly Entity[]): Entity | null => es.reduce<Entity | null>((b, e) => (!b || boxGap(p, e) < boxGap(p, b) || (boxGap(p, e) === boxGap(p, b) && e.id < b.id) ? e : b), null);

function jobOf(sim: Sim): Job | null {
  const p = sim.world.player;
  const params = { ...sim.options.params?.['carry'] };
  const ctx = { params, paramsOf: (id: string) => sim.options.params?.[id] ?? (sim.options.systems.some((s) => s.id === id) ? {} : undefined) };
  const types = carryTypes(ctx);
  const reach = Number(params['reach'] ?? 6);
  if (p.props[CARRYING] !== undefined) {
    const drops = live(sim, types.dropoff);
    const asking = ordersOn(ctx) ? drops.filter((e) => Number(e.props[ORDER_LEFT] ?? 0) > 0).sort((a, b) => Number(a.props[ORDER_LEFT]) - Number(b.props[ORDER_LEFT]) || a.id - b.id) : drops;
    const e = asking[0] ?? nearest(p, drops);
    return e ? { e, act: asking.includes(e) && boxGap(p, e) <= reach } : null;
  }
  const made = live(sim, types.source).filter((e) => Number(e.props[READY_AT] ?? 0) <= sim.tick);
  const e = nearest(p, [...live(sim, types.cargo), ...made]) ?? nearest(p, live(sim, types.source));
  return e ? { e, act: (e.type === types.cargo || made.includes(e)) && boxGap(p, e) <= reach } : null;
}

export const courier: BotPolicy = (sim, tick, mem) => {
  const input = emptyInput();
  const p = sim.world.player;
  if (!p.alive) return input;
  const job = jobOf(sim);
  if (!job) return input;
  const raw = String(sim.options.params?.['carry']?.['key'] ?? 'action');
  const key: CarryKey = (CARRY_KEYS as readonly string[]).includes(raw) ? (raw as CarryKey) : 'action';
  const reach = Number(sim.options.params?.['carry']?.['reach'] ?? 6);
  if (sim.options.movementMode === 'topdown') walkToward(sim, job.e, input, Math.max(1, reach - 2));
  else runToward(sim, job.e, input, tick, mem);
  // A press is a new hold: press on one tick, let go on the next.
  if (job.act && mem['pressed'] !== 1) {
    input[key] = true;
    mem['pressed'] = 1;
  } else mem['pressed'] = 0;
  return input;
};
