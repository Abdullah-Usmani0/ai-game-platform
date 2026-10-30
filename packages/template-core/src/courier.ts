import { centerX, centerY, emptyInput, type Entity, type InputState, type Sim } from '@gg/sdk';
import type { BotPolicy } from './manifest.js';
import { boxGap, CARRY_KEYS, CARRYING, carryTypes, ORDER_LEFT, ordersOn, READY_AT, type CarryKey } from './systems/carry.js';

/**
 * The courier: the bot that plays a carry-and-deliver job the way a good player does. Empty-handed it goes for the
 * nearest cargo lying about or the nearest source with an item made (or waits at a source until it is); carrying, it
 * takes it to the dropoff whose order runs out first (or the nearest, with no orders in the game), and waits there
 * when none asks yet. It presses the carry key once the thing it wants is in reach.
 *
 * Top-down it walks a shortest path over the floor to a tile beside its target. Side view it heads for the target's
 * column and jumps at walls, pits, hazards and foes ahead, and when the target stands above it; a stall turns it round
 * for a moment with a jump.
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

/** Shortest walks over the floor, per sim and start tile (the floor does not change while a level is played). */
const walks = new WeakMap<Sim, { start: string; prev: Map<string, string> }>();

const tileKey = (x: number, y: number) => `${x},${y}`;

function walkFrom(sim: Sim, sx: number, sy: number): Map<string, string> {
  const start = tileKey(sx, sy);
  const known = walks.get(sim);
  if (known?.start === start) return known.prev;
  const prev = new Map<string, string>([[start, '']]);
  const queue: Array<[number, number]> = [[sx, sy]];
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < sim.map.width && y < sim.map.height && sim.map.kindAt(x, y) !== 'solid' && sim.map.kindAt(x, y) !== 'hazard';
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
      const k = tileKey(nx, ny);
      if (prev.has(k) || !open(nx, ny)) continue;
      prev.set(k, tileKey(x, y));
      queue.push([nx, ny]);
    }
  }
  walks.set(sim, { start, prev });
  return prev;
}

/** Top-down: the arrows toward the next tile on a shortest walk to a tile beside the target. */
function walkToward(sim: Sim, target: Entity, input: InputState): void {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const px = Math.floor(centerX(p) / ts);
  const py = Math.floor(centerY(p) / ts);
  const prev = walkFrom(sim, px, py);
  // The goal tiles: any reachable tile within a tile of the target's box.
  let goal: string | null = null;
  let goalD = Infinity;
  const x0 = Math.floor(target.x / ts) - 1;
  const x1 = Math.floor((target.x + target.w - 1) / ts) + 1;
  const y0 = Math.floor(target.y / ts) - 1;
  const y1 = Math.floor((target.y + target.h - 1) / ts) + 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = tileKey(x, y);
      if (!prev.has(k)) continue;
      const d = Math.hypot(x - px, y - py);
      if (d < goalD) {
        goalD = d;
        goal = k;
      }
    }
  }
  if (!goal) return;
  // Walk the chain back to the step after the player's tile.
  let step = goal;
  for (let k = goal; prev.get(k) && prev.get(k) !== tileKey(px, py); k = prev.get(k)!) step = prev.get(k)!;
  const [tx, ty] = step.split(',').map(Number) as [number, number];
  const dx = tx * ts + ts / 2 - centerX(p);
  const dy = ty * ts + ts / 2 - centerY(p);
  // Close enough to the target already: stand.
  if (boxGap(p, target) <= 2) return;
  if (Math.abs(dx) > 1) input[dx > 0 ? 'right' : 'left'] = true;
  if (Math.abs(dy) > 1) input[dy > 0 ? 'down' : 'up'] = true;
}

/** Side view: toward the target's column, jumping at what stands in the way (the platformer walker's rules). */
function runToward(sim: Sim, target: Entity, input: InputState, tick: number, mem: Record<string, number>): void {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const cx = centerX(p);
  let dx = centerX(target) - cx;
  if (boxGap(p, target) <= 2 && p.grounded) dx = 0;
  if (p.grounded && Math.abs(p.x - (mem['lastX'] ?? -1)) < 0.5 && dx !== 0) mem['still'] = (mem['still'] ?? 0) + 1;
  else mem['still'] = 0;
  mem['lastX'] = p.x;
  if ((mem['still'] ?? 0) > 90) {
    mem['still'] = 0;
    mem['escapeUntil'] = tick + 24;
    mem['escapeDir'] = dx >= 0 ? -1 : 1;
    mem['hold'] = 14;
  }
  let dir = Math.abs(dx) > 2 ? Math.sign(dx) : 0;
  if ((mem['escapeUntil'] ?? 0) > tick) dir = mem['escapeDir'] ?? -1;
  if (dir > 0) input.right = true;
  else if (dir < 0) input.left = true;
  const facing = dir !== 0 ? dir : p.facing;
  const feet = p.y + p.h;
  const front = facing > 0 ? p.x + p.w + 1 : p.x - 1;
  const ahead = facing > 0 ? p.x + p.w + 6 : p.x - 6;
  const solid = (x: number, y: number) => sim.map.kindAtPx(x, y) === 'solid';
  const wallAhead = dir !== 0 && (solid(front, feet - 1) || solid(front, p.y + 1));
  const below = sim.map.kindAtPx(ahead, feet + 2);
  const pitAhead = dir !== 0 && (below === 'air' || below === 'hazard') && !(target.y > feet && Math.abs(dx) < ts * 2);
  const hazardAhead = dir !== 0 && sim.map.kindAtPx(ahead, feet - 1) === 'hazard';
  const targetAbove = target.y + target.h <= feet - 4 && Math.abs(dx) < ts * 3;
  const foeAhead = sim.world.entities.some((e) => e.alive && !e.isPlayer && e.contactDamage > 0 && !e.isProjectile && Math.abs(centerY(e) - centerY(p)) < 12 && (centerX(e) - cx) * facing > 0 && Math.abs(centerX(e) - cx) < 22);
  const released = (mem['hold'] ?? 0) === 0 && mem['jumpPrev'] !== 1;
  if (p.grounded && released && (wallAhead || pitAhead || hazardAhead || targetAbove || foeAhead)) mem['hold'] = 20;
  if ((mem['hold'] ?? 0) > 0) {
    input.jump = true;
    mem['hold'] = (mem['hold'] ?? 0) - 1;
  }
  mem['jumpPrev'] = input.jump ? 1 : 0;
}

export const courier: BotPolicy = (sim, tick, mem) => {
  const input = emptyInput();
  const p = sim.world.player;
  if (!p.alive) return input;
  const job = jobOf(sim);
  if (!job) return input;
  const raw = String(sim.options.params?.['carry']?.['key'] ?? 'action');
  const key: CarryKey = (CARRY_KEYS as readonly string[]).includes(raw) ? (raw as CarryKey) : 'action';
  if (sim.options.movementMode === 'topdown') walkToward(sim, job.e, input);
  else runToward(sim, job.e, input, tick, mem);
  // A press is a new hold: press on one tick, let go on the next.
  if (job.act && mem['pressed'] !== 1) {
    input[key] = true;
    mem['pressed'] = 1;
  } else mem['pressed'] = 0;
  return input;
};
