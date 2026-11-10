import { centerX, centerY, sinCosDeg, type Entity, type InputState, type Sim } from '@gg/sdk';
import { boxGap } from './systems/carry.js';

/**
 * Getting about the way a good player does, for bots: top-down a shortest walk at the player's own size; side view
 * toward the target's column, jumping at walls, pits, hazards and foes in the way and when the target stands above, and
 * steering to land on solid ground. The courier gets about this way, and so can a game's own bot (goToward).
 */

/** A place to head for, in pixels: an entity, or any box (a tile is x * tileSize, y * tileSize, tileSize square). */
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  /** An entity's id: walks to it are kept per entity. */
  id?: number;
}

/** The grid a top-down walker walks on: where the player's body can stand, its top-left corner on every second pixel. */
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

/** Walks per sim: the floor does not change while a level is played. */
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
function fieldTo(sim: Sim, m: Walks, target: Spot, near: number): Int32Array {
  const key = `${target.id ?? -1}@${Math.round(target.x)},${Math.round(target.y)}:${near}`;
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
 * Top-down: the side where the player's body stands in the edge of a wall, or null. A body taller than a tile placed
 * under a wall starts so (the spawn stands its feet on the floor); pressing into the wall gets it out, as the collision
 * sets it flush. A hair's overlap from rounding, flush against a wall, does not count.
 */
function stuckInto(sim: Sim, p: Entity): 'up' | 'down' | 'left' | 'right' | null {
  const m = sim.map;
  const e = 0.01;
  if (!m.isSolid(p.x + e, p.y + e, p.w - 2 * e, p.h - 2 * e)) return null;
  if (m.isSolid(p.x + e, p.y + e, p.w - 2 * e, 1)) return 'up';
  if (m.isSolid(p.x + e, p.y + p.h - 1 - e, p.w - 2 * e, 1)) return 'down';
  return m.isSolid(p.x + e, p.y + e, 1, p.h - 2 * e) ? 'left' : 'right';
}

/** Where the player is on the walk grid: the nearest spot round it with a walk to the target, or -1. */
function spotAt(m: Walks, dist: Int32Array, p: Entity): number {
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
  return at;
}

/**
 * Top-down: the arrows toward the next spot on a shortest walk to one within `near` pixels of the target, at the
 * player's own size; straight at the target when no walk leads there.
 */
export function walkToward(sim: Sim, target: Spot, input: InputState, near: number): void {
  const p = sim.world.player;
  if (boxGap(p, target) <= near) return;
  const out = stuckInto(sim, p);
  if (out) {
    input[out] = true;
    return;
  }
  const m = walksOf(sim);
  const dist = fieldTo(sim, m, target, near);
  const at = spotAt(m, dist, p);
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
export function runToward(sim: Sim, target: Spot, input: InputState, tick: number, mem: Record<string, number>): void {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const cx = centerX(p);
  let dx = centerX(target) - cx;
  if (boxGap(p, target) <= 2 && p.grounded) dx = 0;
  if (p.grounded && Math.abs(p.x - (mem['goLastX'] ?? -1)) < 0.5 && dx !== 0) mem['goStill'] = (mem['goStill'] ?? 0) + 1;
  else mem['goStill'] = 0;
  mem['goLastX'] = p.x;
  if ((mem['goStill'] ?? 0) > 90) {
    mem['goStill'] = 0;
    mem['goEscapeUntil'] = tick + 24;
    mem['goEscapeDir'] = dx >= 0 ? -1 : 1;
    mem['goHold'] = 14;
  }
  let dir = Math.abs(dx) > 2 ? Math.sign(dx) : 0;
  if ((mem['goEscapeUntil'] ?? 0) > tick) dir = mem['goEscapeDir'] ?? -1;
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
  const released = (mem['goHold'] ?? 0) === 0 && mem['goJumpPrev'] !== 1;
  // A full jump to climb; a hop over a pit, a hazard or a foe, which comes down before the next pit along.
  if (p.grounded && released && (wallAhead || targetAbove)) mem['goHold'] = 20;
  else if (p.grounded && released && (pitAhead || hazardAhead || foeAhead)) mem['goHold'] = 12;
  // Coming down: keep on, let go or turn back, whichever lands on solid ground (a hop or a stomp's bounce can carry it
  // over the next pit), to jump again from the edge.
  if (!p.grounded && p.vy > 0 && dir !== 0 && (mem['goEscapeUntil'] ?? 0) <= tick) {
    const way = [dir, 0, -dir].find((d) => landsSafely(sim, p, d)) ?? dir;
    input.left = way < 0;
    input.right = way > 0;
  }
  if ((mem['goHold'] ?? 0) > 0) {
    input.jump = true;
    mem['goHold'] = (mem['goHold'] ?? 0) - 1;
  }
  mem['goJumpPrev'] = input.jump ? 1 : 0;
}

/** The keys goToward keeps in a bot's memory. */
const GO_KEYS = ['goTick', 'goLastX', 'goStill', 'goEscapeUntil', 'goEscapeDir', 'goHold', 'goJumpPrev', 'goBackUntil', 'goBackDir', 'goStuckFor'];

/** How many steps along the way ahead a driver steers at: far enough to take a corner wide, near enough to keep to the way. */
const DRIVE_AHEAD = 8;

/**
 * A vehicle (movement-vehicle) heading for a spot, the way a driver gets about: along the same shortest way at its own
 * size, steering at a point a few steps on along it, on the throttle while it faces near enough that way and braking into
 * a sharp turn at speed; stopped against something, it backs up a moment with the wheel the other way. Arrived, it
 * brakes to a stop.
 */
export function driveToward(sim: Sim, target: Spot, input: InputState, tick: number, mem: Record<string, number>, near: number): void {
  const p = sim.world.player;
  const heading = Number(p.props['heading'] ?? 0);
  const [sin, cos] = sinCosDeg(heading);
  const along = p.vx * cos + p.vy * sin;
  if (boxGap(p, target) <= near) {
    // Down brakes while it rolls forward; once stopped it would back up, so it lets go.
    if (along > 8) input.down = true;
    return;
  }
  if (tick < (mem['goBackUntil'] ?? -1)) {
    // Backing up turns the nose the other way, so the wheel goes the other way too.
    input.down = true;
    input[mem['goBackDir'] === 1 ? 'right' : 'left'] = true;
    return;
  }
  const m = walksOf(sim);
  const dist = fieldTo(sim, m, target, near);
  let aimX = centerX(target);
  let aimY = centerY(target);
  let next = spotAt(m, dist, p);
  if (next >= 0) {
    for (let k = 0; k < DRIVE_AHEAD; k++) {
      let best = next;
      for (const [dx, dy] of NEIGHBOURS) {
        const j = stepOpen(m, next, dx, dy);
        if (j >= 0 && dist[j]! >= 0 && dist[j]! < dist[best]!) best = j;
      }
      if (best === next) break;
      next = best;
    }
    aimX = (next % m.cols) * STEP + p.w / 2;
    aimY = Math.floor(next / m.cols) * STEP + p.h / 2;
  }
  const want = (Math.atan2(aimY - centerY(p), aimX - centerX(p)) * 180) / Math.PI;
  const off = ((((want - heading) % 360) + 540) % 360) - 180;
  if (off > 6) input.right = true;
  else if (off < -6) input.left = true;
  if (Math.abs(off) < 75 || along < 20) input.up = true;
  else if (along > 45) input.down = true;
  // On the throttle and going nowhere: stuck against a wall or a rock. Back up a moment.
  if (input.up && Math.hypot(p.vx, p.vy) < 6) {
    mem['goStuckFor'] = (mem['goStuckFor'] ?? 0) + 1;
    if (mem['goStuckFor']! > 20) {
      mem['goBackUntil'] = tick + 24;
      mem['goBackDir'] = off > 0 ? -1 : 1;
      mem['goStuckFor'] = 0;
    }
  } else mem['goStuckFor'] = 0;
}

/**
 * Heads for a spot: sets the arrows (and jump, side view) on `input` for this tick. Top-down it walks a shortest way to
 * within `near` pixels of the spot, or drives one in a vehicle; side view it runs toward it and jumps what is in the way. It keeps what it needs
 * between ticks in the bot's memory, under keys starting with `go`; a bot that stops calling it for a while (to wait, to
 * hide) starts afresh when it calls again.
 */
export function goToward(sim: Sim, spot: Spot, input: InputState, tick: number, mem: Record<string, number>, near = 2): void {
  if (tick - (mem['goTick'] ?? -Infinity) > 1) for (const k of GO_KEYS) delete mem[k];
  mem['goTick'] = tick;
  if (drives(sim)) driveToward(sim, spot, input, tick, mem, near);
  else if (sim.options.movementMode === 'topdown') walkToward(sim, spot, input, near);
  else runToward(sim, spot, input, tick, mem);
}

/**
 * The open place nearest a point (pixels) where the player's whole body fits, as a spot at the body's middle; null on a
 * level with nowhere open. Top-down only (a side view stands on ground, not anywhere open).
 */
export function openSpotNear(sim: Sim, x: number, y: number): Spot | null {
  const m = walksOf(sim);
  const { w, h } = sim.world.player;
  let best = -1;
  let gap = Infinity;
  for (let i = 0; i < m.free.length; i++) {
    if (!m.free[i]) continue;
    const d = Math.hypot((i % m.cols) * STEP + w / 2 - x, Math.floor(i / m.cols) * STEP + h / 2 - y);
    if (d < gap) {
      gap = d;
      best = i;
    }
  }
  return best < 0 ? null : { x: (best % m.cols) * STEP + w / 2 - 1, y: Math.floor(best / m.cols) * STEP + h / 2 - 1, w: 2, h: 2 };
}

/** The player drives a vehicle (movement-vehicle puts its kind on the player): it is steered, not walked. */
export function drives(sim: Sim): boolean {
  return typeof sim.world.player.props['vehicle'] === 'string';
}

/** The level's goal, as a spot at the middle of its tile: reaching it stands the player on the goal. */
export function goalSpot(sim: Sim): Spot {
  const ts = sim.map.tileSize;
  const { x, y } = sim.map.level.goal;
  return { x: x * ts + ts / 2 - 1, y: y * ts + ts / 2 - 1, w: 2, h: 2 };
}
