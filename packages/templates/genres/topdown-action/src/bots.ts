import { centerX, centerY, emptyInput, type Entity, type InputState, type Sim, type Tilemap } from '@gg/sdk';
import type { BotPolicy } from '@gg/template-core';
import { isHostile } from './entities.js';

const hostile = (e: Entity) => isHostile(e);

/** First step of the shortest 4-neighbour tile path from `from` to `to`, or null when unreachable. */
export function nextTileToward(map: Tilemap, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } | null {
  if (from.x === to.x && from.y === to.y) return to;
  const prev = new Map<string, string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const start = key(from.x, from.y);
  prev.set(start, '');
  const queue = [from];
  let found = false;
  while (queue.length > 0 && !found) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = key(nx, ny);
      if (prev.has(k) || map.kindAt(nx, ny) === 'solid') continue;
      prev.set(k, key(cur.x, cur.y));
      if (nx === to.x && ny === to.y) {
        found = true;
        break;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  if (!found) return null;
  let cur = key(to.x, to.y);
  while (prev.get(cur) !== start) cur = prev.get(cur)!;
  const [x, y] = cur.split(',').map(Number) as [number, number];
  return { x, y };
}

function pressToward(input: InputState, dx: number, dy: number, dead = 1): void {
  if (dx > dead) input.right = true;
  else if (dx < -dead) input.left = true;
  if (dy > dead) input.down = true;
  else if (dy < -dead) input.up = true;
}

/**
 * Clearer: the solver. Paths tile by tile to the nearest hostile, swings when in reach, dashes out of arrows and
 * away when hurt and crowded, and walks to the exit once the room is clear.
 */
export const clearer: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  const p = sim.world.player;
  if (!p.alive) return input;
  const map = sim.map;
  const ts = map.tileSize;
  const px = centerX(p);
  const py = centerY(p);
  const hostiles = sim.world.entities.filter(hostile);
  // Anything already on top of us gets fought first; otherwise awake archers (they bleed hp from across
  // the room) before the nearest sleeper.
  const awake = (e: Entity) => e.type === 'archer' && e.fsm !== null && e.fsm.state !== 'wait';
  let target: Entity | null = null;
  let best = Infinity;
  for (const e of hostiles) {
    const real = Math.hypot(centerX(e) - px, centerY(e) - py);
    const d = real <= 24 ? real - 2000 : real - (awake(e) ? 1000 : 0);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  if (target) best = Math.hypot(centerX(target) - px, centerY(target) - py);
  // Between fights, heal on a nearby gem before heading for the exit.
  let gem: Entity | null = null;
  if (p.hp < p.maxHp && (!target || best > 100)) {
    let gd = 120;
    for (const e of sim.world.entities) {
      if (!e.alive || !e.pickup) continue;
      const d = Math.hypot(centerX(e) - px, centerY(e) - py);
      if (d < gd) {
        gd = d;
        gem = e;
      }
    }
  }
  const goal = map.level.goal;
  const dest = gem ?? target;
  const tx = dest ? Math.floor(centerX(dest) / ts) : goal.x;
  const ty = dest ? Math.floor(centerY(dest) / ts) : goal.y;
  const ptx = Math.floor(px / ts);
  const pty = Math.floor(py / ts);
  const targetKey = tx * 1000 + ty;
  // Hysteresis: keep the current waypoint until it is reached (equal-length routes would otherwise flip).
  const reached = (mem['nx'] ?? -1) < 0 || (Math.abs((mem['nx']! + 0.5) * ts - px) < 2 && Math.abs((mem['ny']! + 0.5) * ts - py) < 2);
  if (reached || (mem['recalcAt'] ?? -1) <= tick || mem['targetKey'] !== targetKey) {
    const next = nextTileToward(map, { x: ptx, y: pty }, { x: tx, y: ty });
    mem['nx'] = next ? next.x : -1;
    mem['ny'] = next ? next.y : -1;
    mem['targetKey'] = targetKey;
    mem['recalcAt'] = tick + 30;
  }
  const reach = 16;
  // Crowds and brutes are fought at the player's pace: approach on the first half of the swing cycle, step
  // away on the second half so only the front enemy connects (the swing auto-aims anyway).
  const close = hostiles.filter((e) => Math.hypot(centerX(e) - px, centerY(e) - py) < 18);
  const windingUp = close.filter((e) => e.fsm?.state === 'windup' || e.fsm?.state === 'bite');
  const kite = close.length >= 2 || close.some((e) => e.type === 'brute');
  if (target && best <= reach && !gem) {
    if (windingUp.length > 0) {
      // A telegraphed bite: step out of its reach while still swinging (a hit interrupts the wind-up).
      let ax = 0;
      let ay = 0;
      for (const e of windingUp) {
        ax += px - centerX(e);
        ay += py - centerY(e);
      }
      pressToward(input, ax, ay, 0.01);
    } else if (kite && tick % 18 >= 9) {
      let ax = 0;
      let ay = 0;
      for (const e of close) {
        ax += px - centerX(e);
        ay += py - centerY(e);
      }
      pressToward(input, ax, ay, 0.01);
    } else if (best > 9 || tick % 6 === 0) pressToward(input, centerX(target) - px, centerY(target) - py, 0.5);
    input.action = true;
  } else if ((mem['nx'] ?? -1) >= 0) {
    pressToward(input, (mem['nx']! + 0.5) * ts - px, (mem['ny']! + 0.5) * ts - py, 0.3);
    if (target && best <= reach + 10) input.action = true;
  } else if (dest) {
    pressToward(input, centerX(dest) - px, centerY(dest) - py);
  }
  // Stuck breaker: no movement for 20 ticks while steering means a corner snag; nudge toward the lane centre.
  if (Math.abs(px - (mem['lastX'] ?? -1)) < 0.2 && Math.abs(py - (mem['lastY'] ?? -1)) < 0.2 && (input.left || input.right || input.up || input.down)) mem['stuck'] = (mem['stuck'] ?? 0) + 1;
  else mem['stuck'] = 0;
  mem['lastX'] = px;
  mem['lastY'] = py;
  if ((mem['stuck'] ?? 0) > 12 && (mem['escapeUntil'] ?? -1) < tick) {
    // Bodies are taller than a tile, so a pillar corner can block the lane: slide along the perpendicular
    // axis for 20 ticks (alternating the direction each time) while keeping the primary direction pressed.
    mem['escapeUntil'] = tick + 20;
    mem['escapeSign'] = -(mem['escapeSign'] ?? -1);
    mem['escapeAxis'] = input.left || input.right ? 1 : 0;
    mem['stuck'] = 0;
  }
  if ((mem['escapeUntil'] ?? -1) >= tick) {
    const sign = mem['escapeSign'] ?? 1;
    if (mem['escapeAxis'] === 1) {
      input.up = sign < 0;
      input.down = sign > 0;
    } else {
      input.left = sign < 0;
      input.right = sign > 0;
    }
  }
  // Arrows: parry when one is about to arrive, dash sideways when one is closing and the dash is ready.
  let threat: Entity | null = null;
  let threatDist = Infinity;
  for (const e of sim.world.entities) {
    if (!e.alive || !e.isProjectile) continue;
    const dx = px - centerX(e);
    const dy = py - centerY(e);
    const d = Math.hypot(dx, dy);
    if (d < threatDist && dx * e.vx + dy * e.vy > 0) {
      threat = e;
      threatDist = d;
    }
  }
  if (threat && threatDist < 18) {
    input.left = input.right = input.up = input.down = false;
    pressToward(input, centerX(threat) - px, centerY(threat) - py, 0.01);
    input.action = true;
  }
  const lastDash = mem['lastDash'] ?? -100;
  if (tick - lastDash > 40) {
    const crowded = hostiles.filter((e) => Math.hypot(centerX(e) - px, centerY(e) - py) < 14).length >= 2;
    if ((threat && threatDist < 30) || (p.hp <= 2 && crowded)) {
      const ax = threat ? -threat.vy : px - (target ? centerX(target) : px);
      const ay = threat ? threat.vx : py - (target ? centerY(target) : py);
      input.left = input.right = input.up = input.down = false;
      pressToward(input, ax, ay, 0.01);
      input.dash = true;
      mem['lastDash'] = tick;
    }
  }
  return input;
};

/** Coward: walks straight to the exit without fighting; must not win while the exit is locked. */
export const coward: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  const p = sim.world.player;
  if (!p.alive) return input;
  const map = sim.map;
  const ts = map.tileSize;
  const px = centerX(p);
  const py = centerY(p);
  if ((mem['recalcAt'] ?? -1) <= tick) {
    const next = nextTileToward(map, { x: Math.floor(px / ts), y: Math.floor(py / ts) }, map.level.goal);
    mem['nx'] = next ? next.x : -1;
    mem['ny'] = next ? next.y : -1;
    mem['recalcAt'] = tick + 6;
  }
  if ((mem['nx'] ?? -1) >= 0) pressToward(input, (mem['nx']! + 0.5) * ts - px, (mem['ny']! + 0.5) * ts - py);
  return input;
};

export const afk: BotPolicy = () => emptyInput();

export const chaos: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  if (tick % 15 === 0) {
    mem['dx'] = sim.rng.int(3) - 1;
    mem['dy'] = sim.rng.int(3) - 1;
  }
  if ((mem['dx'] ?? 0) > 0) input.right = true;
  if ((mem['dx'] ?? 0) < 0) input.left = true;
  if ((mem['dy'] ?? 0) > 0) input.down = true;
  if ((mem['dy'] ?? 0) < 0) input.up = true;
  if (tick % 7 === 0) input.action = true;
  if (tick % 53 === 0) input.dash = true;
  return input;
};

export const BOTS: Record<string, BotPolicy> = { clearer, coward, afk, chaos };
