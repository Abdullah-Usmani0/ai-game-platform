import { centerX, centerY, emptyInput, type Entity, type InputState, type Sim, type Tilemap } from '@gg/sdk';
import { botRandom, type BotPolicy } from '@gg/template-core';
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
  // Between fights, heal on a nearby gem before heading for the exit. A gem once chosen is kept until it is taken or a
  // fight comes close: along a winding path the straight-line distances come and go, and re-deciding made the bot dither.
  let gem: Entity | null = null;
  const kept = sim.world.entities.find((e) => e.id === mem['gem'] && e.alive && e.pickup) ?? null;
  if (p.hp < p.maxHp && kept && (!target || best > 40)) gem = kept;
  else if (p.hp < p.maxHp && (!target || best > 100)) {
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
  mem['gem'] = gem ? gem.id : -1;
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
  // Crowds, brutes and bosses are fought at the player's pace: approach on the first half of the swing cycle, step
  // away on the second half so only the front enemy connects (the swing auto-aims anyway).
  const dist = (e: Entity) => Math.hypot(centerX(e) - px, centerY(e) - py);
  const close = hostiles.filter((e) => dist(e) < 18);
  // A telegraphed attack (a bite, or a boss's slam, which reaches further) is stepped out of.
  const windingUp = hostiles.filter((e) => /^(windup|bite)/.test(e.fsm?.state ?? '') && dist(e) < (e.flags['boss'] ? 34 : 18));
  const kite = close.length >= 2 || close.some((e) => e.type === 'brute' || e.flags['boss'] === true);
  if (windingUp.length > 0 && !gem) {
    // A telegraphed bite or slam: step out of its reach while still swinging (a hit interrupts a grunt's wind-up).
    let ax = 0;
    let ay = 0;
    for (const e of windingUp) {
      ax += px - centerX(e);
      ay += py - centerY(e);
    }
    pressToward(input, ax, ay, 0.01);
    input.action = true;
  } else if (target && best <= reach && !gem) {
    if (kite && tick % 18 >= 9) {
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
  // Projectiles: the one that will pass closest soonest. About to land, it is parried (a swing destroys it); on its
  // way, it is sidestepped across its path; dead on and close, a dash takes the player through it.
  let threat: Entity | null = null;
  let threatT = Infinity;
  let sideX = 0;
  let sideY = 0;
  for (const e of sim.world.entities) {
    if (!e.alive || !e.isProjectile) continue;
    const rx = px - centerX(e);
    const ry = py - centerY(e);
    const v2 = e.vx * e.vx + e.vy * e.vy;
    if (v2 < 1) continue;
    const tc = (rx * e.vx + ry * e.vy) / v2;
    if (tc <= 0 || tc > 0.6) continue;
    const mx = rx - e.vx * tc;
    const my = ry - e.vy * tc;
    const miss = Math.hypot(mx, my);
    if (miss > 8 || tc >= threatT) continue;
    threat = e;
    threatT = tc;
    // Step to the side the miss already leans to (the left of its path when it is dead on).
    const v = Math.sqrt(v2);
    sideX = miss > 0.5 ? mx / miss : -e.vy / v;
    sideY = miss > 0.5 ? my / miss : e.vx / v;
  }
  const threatDist = threat ? Math.hypot(centerX(threat) - px, centerY(threat) - py) : Infinity;
  if (threat) {
    input.left = input.right = input.up = input.down = false;
    if (threatDist < 16) {
      pressToward(input, centerX(threat) - px, centerY(threat) - py, 0.01);
      input.action = true;
    } else pressToward(input, sideX, sideY, 0.01);
  }
  const lastDash = mem['lastDash'] ?? -100;
  if (tick - lastDash > 40) {
    const crowded = hostiles.filter((e) => Math.hypot(centerX(e) - px, centerY(e) - py) < 14).length >= 2;
    if ((threat && threatT < 0.2 && threatDist >= 16) || (p.hp <= 2 && crowded)) {
      const ax = threat ? sideX : px - (target ? centerX(target) : px);
      const ay = threat ? sideY : py - (target ? centerY(target) : py);
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
    const rnd = botRandom(sim, mem);
    mem['dx'] = rnd.int(3) - 1;
    mem['dy'] = rnd.int(3) - 1;
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
