import { centerX, centerY, emptyInput, isHostile, type Sim } from '@gg/sdk';
import type { BotPolicy } from './manifest.js';
import { driveToward, goalSpot, openSpotNear, type Spot } from './navigate.js';

/**
 * The helmsman: the bot that plays a vehicle game the vehicle block brings, the way a good driver does. A game won at its
 * goal it drives there. A game won by holding out it keeps under way: round the open water (or the open ground) on a
 * wide ring about the middle, so whatever chases it falls in behind, its guns firing whenever they bear (the action key
 * held: a broadside fires only at a foe abeam). Kept under way, a chaser cutting across the ring comes abeam and is shot;
 * one closing on its bow it turns away from, which brings it abeam too.
 */

/** Points on the ring it sails round, as many as a compass has; the next once it is within reach of one. */
const RING = 8;
const REACH = 28;
/** A foe this near, this many degrees either side of the bow, is closing to ram: turn away from it. */
const RAM_NEAR = 56;
const RAM_ARC = 55;

/** The game is won by reaching the goal (the goal system, or objectives with a reach_goal clause). */
function headsForGoal(sim: Sim): boolean {
  if (sim.options.systems.some((s) => s.id === 'goal')) return true;
  const o = sim.options.content?.['objectives'] as { win?: { clauses?: ReadonlyArray<{ kind?: string }> } } | undefined;
  return o?.win?.clauses?.some((c) => c.kind === 'reach_goal') ?? false;
}

/** Rings per sim: the open water does not change while a level is played. */
const rings = new WeakMap<Sim, Spot[]>();

/** The ring's points: open places round the middle of the level, a third of its narrower side out. */
function ringOf(sim: Sim): Spot[] {
  const known = rings.get(sim);
  if (known) return known;
  const cx = sim.map.pixelWidth / 2;
  const cy = sim.map.pixelHeight / 2;
  const r = Math.min(sim.map.pixelWidth, sim.map.pixelHeight) / 3;
  const out: Spot[] = [];
  for (let k = 0; k < RING; k++) {
    const a = (k / RING) * Math.PI * 2;
    const spot = openSpotNear(sim, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    if (spot) out.push(spot);
  }
  rings.set(sim, out);
  return out;
}

export const helmsman: BotPolicy = (sim, tick, mem) => {
  const input = emptyInput();
  const p = sim.world.player;
  if (!p.alive) return input;
  if (headsForGoal(sim)) {
    driveToward(sim, goalSpot(sim), input, tick, mem, 1);
    return input;
  }
  const ring = ringOf(sim);
  if (ring.length === 0) return input;
  // Start at the ring point nearest ahead, then go round.
  if (mem['hmWay'] === undefined) {
    let best = 0;
    for (let k = 1; k < ring.length; k++) if (Math.hypot(centerX(ring[k]!) - centerX(p), centerY(ring[k]!) - centerY(p)) < Math.hypot(centerX(ring[best]!) - centerX(p), centerY(ring[best]!) - centerY(p))) best = k;
    mem['hmWay'] = best;
  }
  let way = ring[mem['hmWay']! % ring.length]!;
  if (Math.hypot(centerX(way) - centerX(p), centerY(way) - centerY(p)) < REACH) {
    mem['hmWay'] = (mem['hmWay']! + 1) % ring.length;
    way = ring[mem['hmWay']!]!;
  }
  driveToward(sim, way, input, tick, mem, 4);
  // A foe closing on the bow: put the helm over away from it and keep the way on.
  const heading = Number(p.props['heading'] ?? 0);
  let ram: number | null = null;
  let nearest = RAM_NEAR;
  for (const e of sim.world.entities) {
    if (!e.alive || !isHostile(e) || e.isProjectile) continue;
    const d = Math.hypot(centerX(e) - centerX(p), centerY(e) - centerY(p));
    if (d >= nearest) continue;
    const off = (((((Math.atan2(centerY(e) - centerY(p), centerX(e) - centerX(p)) * 180) / Math.PI - heading) % 360) + 540) % 360) - 180;
    if (Math.abs(off) > RAM_ARC) continue;
    nearest = d;
    ram = off;
  }
  if (ram !== null) {
    input.left = ram > 0;
    input.right = ram <= 0;
    input.up = true;
    input.down = false;
  }
  // Hold the guns' key while any foe is about; they fire when they bear.
  if (sim.world.entities.some((e) => e.alive && isHostile(e))) input.action = true;
  return input;
};
