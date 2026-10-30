import { centerX, centerY, emptyInput, type Entity, type InputState, type Sim } from '@gg/sdk';
import type { BotPolicy } from './manifest.js';
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

/** The grid a top-down courier walks on: where the player's body can stand, its top-left corner on every second pixel. */
const STEP = 2;
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

interface Walks {
  cols: number;
  rows: number;
  /** 1 where the player's whole body fits, clear of walls and hazards (a tall body cannot slip through a one-tile gap). */
  free: Uint8Array;
  /** Steps from each spot to one beside a target, by the target and where it is; -1 where no walk leads there. */
  to: Map<string, Int32Array>;
}

/** Walks per sim: the floor does not change while a level is played, and the stations do not move. */
const walks = new WeakMap<Sim, Walks>();

function walksOf(sim: Sim): Walks {
  const known = walks.get(sim);
  if (known) return known;
  const { w, h } = sim.world.player;
  const ts = sim.map.tileSize;
  const cols = Math.max(1, Math.floor((sim.map.pixelWidth - w) / STEP) + 1);
  const rows = Math.max(1, Math.floor((sim.map.pixelHeight - h) / STEP) + 1);
  const free = new Uint8Array(cols * rows);
  const blocked = (tx: number, ty: number) => sim.map.kindAt(tx, ty) === 'solid' || sim.map.kindAt(tx, ty) === 'hazard';
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x = gx * STEP;
      const y = gy * STEP;
      let fits = true;
      for (let ty = Math.floor(y / ts); fits && ty <= Math.floor((y + h - 1) / ts); ty++) {
        for (let tx = Math.floor(x / ts); fits && tx <= Math.floor((x + w - 1) / ts); tx++) fits = !blocked(tx, ty);
      }
      free[gy * cols + gx] = fits ? 1 : 0;
    }
  }
  const made: Walks = { cols, rows, free, to: new Map() };
  walks.set(sim, made);
  return made;
}

/** A step from spot i to j is open: j fits, and a diagonal step does not cut a wall's corner. */
function stepOpen(m: Walks, i: number, dx: number, dy: number): number {
  const gx = i % m.cols;
  const gy = (i - gx) / m.cols;
  const nx = gx + dx;
  const ny = gy + dy;
  if (nx < 0 || ny < 0 || nx >= m.cols || ny >= m.rows) return -1;
  const j = ny * m.cols + nx;
  if (!m.free[j]) return -1;
  if (dx !== 0 && dy !== 0 && (!m.free[gy * m.cols + nx] || !m.free[ny * m.cols + gx])) return -1;
  return j;
}

/** Steps from every spot to one within `near` pixels of the target, walking backwards from those spots. */
function fieldTo(sim: Sim, m: Walks, target: Entity, near: number): Int32Array {
  const key = `${target.id}@${Math.round(target.x)},${Math.round(target.y)}:${near}`;
  const known = m.to.get(key);
  if (known) return known;
  const { w, h } = sim.world.player;
  const dist = new Int32Array(m.cols * m.rows).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < dist.length; i++) {
    if (!m.free[i] || boxGap({ x: (i % m.cols) * STEP, y: Math.floor(i / m.cols) * STEP, w, h }, target) > near) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const [dx, dy] of NEIGHBOURS) {
      const j = stepOpen(m, i, dx, dy);
      if (j < 0 || dist[j]! >= 0) continue;
      dist[j] = dist[i]! + 1;
      queue.push(j);
    }
  }
  m.to.set(key, dist);
  return dist;
}

/**
 * Top-down: the arrows toward the next spot on a shortest walk to one within `near` pixels of the target, at the
 * player's own size; straight at the target when no walk leads there.
 */
function walkToward(sim: Sim, target: Entity, input: InputState, near: number): void {
  const p = sim.world.player;
  if (boxGap(p, target) <= near) return;
  const m = walksOf(sim);
  const dist = fieldTo(sim, m, target, near);
  // Where the player is: the nearest spot round it with a walk to the target.
  const gx0 = Math.round(p.x / STEP);
  const gy0 = Math.round(p.y / STEP);
  let at = -1;
  let atGap = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = gx0 + dx;
      const gy = gy0 + dy;
      if (gx < 0 || gy < 0 || gx >= m.cols || gy >= m.rows || dist[gy * m.cols + gx]! < 0) continue;
      const gap = Math.hypot(gx * STEP - p.x, gy * STEP - p.y);
      if (gap < atGap) {
        atGap = gap;
        at = gy * m.cols + gx;
      }
    }
  }
  let tx = centerX(target) - centerX(p);
  let ty = centerY(target) - centerY(p);
  if (at >= 0) {
    let next = at;
    for (const [dx, dy] of NEIGHBOURS) {
      const j = stepOpen(m, at, dx, dy);
      if (j >= 0 && dist[j]! >= 0 && dist[j]! < dist[next]!) next = j;
    }
    tx = (next % m.cols) * STEP - p.x;
    ty = Math.floor(next / m.cols) * STEP - p.y;
  }
  if (Math.abs(tx) > 0.25) input[tx > 0 ? 'right' : 'left'] = true;
  if (Math.abs(ty) > 0.25) input[ty > 0 ? 'down' : 'up'] = true;
}

/**
 * Side view: whether the player, falling from where it is and steering `dir` (-1, 0 or 1) the whole way, comes down on
 * solid ground rather than into a hazard or out of the level, with the platformer's air control (it turns slowly).
 */
function landsSafely(sim: Sim, p: Entity, dir: number): boolean {
  const f = sim.options.feel;
  const dt = 1 / 60;
  const approach = (v: number, to: number, by: number) => (v < to ? Math.min(v + by, to) : Math.max(v - by, to));
  const solidAt = (x: number, y: number) => sim.map.kindAtPx(x, y) === 'solid';
  let { x, y, vx, vy } = p;
  for (let t = 0; t < 120; t++) {
    const to = dir * f.maxRun;
    const over = Math.abs(vx) > Math.abs(to) && Math.sign(vx) === Math.sign(to) && to !== 0;
    vx = approach(vx, to, (over ? f.runReduce : f.runAccel) * f.airMult * dt);
    vy = approach(vy, f.maxFall, f.gravity * dt);
    const nx = x + vx * dt;
    // A wall stops it going that way.
    const side = vx > 0 ? nx + p.w : nx;
    if (vx !== 0 && (solidAt(side, y + 1) || solidAt(side, y + p.h - 1))) vx = 0;
    else x = nx;
    y += vy * dt;
    const feet = y + p.h;
    if (feet > sim.map.pixelHeight) return false;
    const under = [sim.map.kindAtPx(x + 1, feet), sim.map.kindAtPx(x + p.w - 1, feet)];
    if (under.includes('hazard')) return false;
    if (under.includes('solid')) return true;
  }
  return false;
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
  // A full jump to climb; a hop over a pit, a hazard or a foe, which comes down before the next pit along.
  if (p.grounded && released && (wallAhead || targetAbove)) mem['hold'] = 20;
  else if (p.grounded && released && (pitAhead || hazardAhead || foeAhead)) mem['hold'] = 12;
  // Coming down: keep on, let go or turn back, whichever lands on solid ground (a hop or a stomp's bounce can carry it
  // over the next pit), to jump again from the edge.
  if (!p.grounded && p.vy > 0 && dir !== 0 && (mem['escapeUntil'] ?? 0) <= tick) {
    const way = [dir, 0, -dir].find((d) => landsSafely(sim, p, d)) ?? dir;
    input.left = way < 0;
    input.right = way > 0;
  }
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
