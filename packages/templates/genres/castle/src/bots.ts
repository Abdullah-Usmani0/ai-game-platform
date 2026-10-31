import { centerX, centerY, emptyInput, type Entity, type InputState, type Sim } from '@gg/sdk';
import type { BotPolicy } from '@gg/template-core';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP, ALTAR_TYPE, RELIC_ABILITY } from './entities.js';
import { envelopeFor, reachFrom, relicReach, tallTiles } from './level/progress.js';

/** Tiles of hazard ahead (columns whose first floor down is spikes or the void) that need the air abilities. */
const WIDE_PIT = 4;
/** The bot's memory keys: what it heads for, and how far through a jump it is. */
const PLAN_SIG = 'sig';
const PLAN_X = 'tx';
const PLAN_Y = 'ty';
/** 0 on the ground, 1 the first jump rising, 2 let go before an air jump, 3 the air jump rising, 4 coming down. */
const PHASE = 'phase';

function tileOf(sim: Sim, e: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  const ts = sim.map.tileSize;
  return { x: Math.floor(centerX(e) / ts), y: Math.floor((e.y + e.h - 0.5) / ts) };
}

/** What the bot heads for changes when an ability or a relic does: a number that says which. */
function signature(sim: Sim): number {
  const p = sim.world.player;
  let live = 0;
  for (const e of sim.world.entities) if (e.alive && RELIC_ABILITY[e.type] !== undefined) live++;
  return (p.flags[ABILITY_DOUBLE_JUMP] === true ? 1 : 0) + (p.flags[ABILITY_DASH] === true ? 2 : 0) + 4 * live;
}

/** The nearest relic the player can reach now, else the goal. */
function choose(sim: Sim, mem: Record<string, number>): void {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const env = envelopeFor(sim.options.feel, ts, { doubleJump: p.flags[ABILITY_DOUBLE_JUMP] === true, dash: p.flags[ABILITY_DASH] === true });
  const dist = reachFrom(sim.map, tileOf(sim, p), env, tallTiles(ts));
  const goal = sim.options.level.goal;
  let best = Infinity;
  mem[PLAN_X] = goal.x;
  mem[PLAN_Y] = goal.y;
  for (const e of sim.world.entities) {
    if (!e.alive || RELIC_ABILITY[e.type] === undefined) continue;
    const t = tileOf(sim, e);
    const d = relicReach(dist, t.x, t.y, env);
    if (d === null || d >= best) continue;
    best = d;
    mem[PLAN_X] = t.x;
    mem[PLAN_Y] = t.y;
  }
}

/** A column with no floor before spikes or the bottom of the map, looking down from the feet. */
function pitColumn(sim: Sim, px: number, feet: number): boolean {
  const ts = sim.map.tileSize;
  for (let ty = Math.floor((feet + 1) / ts); ty < sim.map.height; ty++) {
    const k = sim.map.kindAtPx(px, ty * ts + 1);
    if (k === 'solid' || k === 'oneway') return false;
    if (k === 'hazard') return true;
  }
  return true;
}

/** Columns of pit ahead of `fromPx`, up to 30. */
function pitWidth(sim: Sim, fromPx: number, feet: number, facing: number): number {
  const ts = sim.map.tileSize;
  const tx0 = Math.floor(fromPx / ts);
  for (let k = 0; k < 30; k++) if (!pitColumn(sim, (tx0 + k * facing) * ts + ts / 2, feet)) return k;
  return 30;
}

function hostileAhead(sim: Sim, p: Entity, facing: number, k: number): boolean {
  const cx = centerX(p);
  return sim.world.entities.some((e) => {
    if (!e.alive || e.isPlayer || e.dormant === true || e.contactDamage <= 0) return false;
    const dx = (centerX(e) - cx) * facing;
    // A shot coming at the player low enough to hit their legs, or an enemy on their path.
    if (e.isProjectile) return dx > 0 && dx < 40 * k && e.vx * facing < 0 && e.y + e.h > p.y + p.h * 0.5 && e.y < p.y + p.h;
    return dx > 0 && dx < 24 * k && Math.abs(centerY(e) - centerY(p)) < 16 * k;
  });
}

/**
 * The castle's route bot: heads for the nearest relic it can reach, else the goal, re-planning when an ability or a
 * relic changes. It runs at its target and jumps at walls, pits, enemies and shots, takes the air jump at the apex
 * while a wall is still ahead, the target is above or a wide pit is under it, and dashes after that apex over a wide
 * pit; it leaves the ground at the last moment before a pit. It rests at every altar it passes. A stall of 1.5 s turns
 * it back for a moment with a jump. Its state is its memory only (GlueTS).
 */
export const route: BotPolicy = (sim, tick, mem) => {
  const p = sim.world.player;
  const input: InputState = emptyInput();
  if (!p.alive) {
    mem[PHASE] = 0;
    return input;
  }
  const ts = sim.map.tileSize;
  const k = ts / 8;
  const sig = signature(sim);
  if (mem[PLAN_SIG] !== sig && p.grounded) {
    choose(sim, mem);
    mem[PLAN_SIG] = sig;
  }
  const tx = mem[PLAN_X] ?? sim.options.level.goal.x;
  const ty = mem[PLAN_Y] ?? sim.options.level.goal.y;
  const hasDouble = p.flags[ABILITY_DOUBLE_JUMP] === true;
  const hasDash = p.flags[ABILITY_DASH] === true;
  const cx = centerX(p);
  const dxPx = tx * ts + ts / 2 - cx;

  // Stall breaker: standing still on the ground for 90 ticks turns back for 24 ticks with a jump.
  if (p.grounded && Math.abs(p.x - (mem['lastX'] ?? -1)) < 0.5) mem['still'] = (mem['still'] ?? 0) + 1;
  else mem['still'] = 0;
  mem['lastX'] = p.x;
  if ((mem['still'] ?? 0) > 90) {
    mem['still'] = 0;
    mem['escapeUntil'] = tick + 24;
    mem['escapeDir'] = dxPx >= 0 ? -1 : 1;
  }
  const escaping = (mem['escapeUntil'] ?? 0) > tick;
  let dir = Math.abs(dxPx) > 2 ? Math.sign(dxPx) : 0;
  if (escaping) dir = mem['escapeDir'] ?? -1;
  if (dir > 0) input.right = true;
  else if (dir < 0) input.left = true;

  // Rest at an altar within reach, once each: known by its place in the level, as a rest reloads the region and the
  // altar comes back with a new id.
  for (const e of sim.world.entities) {
    const rested = `rest${e.levelIndex ?? -e.id}`;
    if (!e.alive || e.type !== ALTAR_TYPE || mem[rested] === 1) continue;
    if (Math.abs(centerX(e) - cx) <= e.w / 2 + 4 && Math.abs(centerY(e) - centerY(p)) <= e.h / 2 + 4) {
      mem[rested] = 1;
      input.up = true;
    }
  }

  const facing = dir !== 0 ? dir : p.facing;
  const feet = p.y + p.h;
  const front = facing > 0 ? p.x + p.w + 1 : p.x - 1;
  const back = facing > 0 ? p.x + 2 : p.x + p.w - 2;
  const solidAt = (px: number, py: number) => sim.map.kindAtPx(px, py) === 'solid';
  const wallAhead = dir !== 0 && (solidAt(front, feet - 1) || solidAt(front, p.y + p.h / 2) || solidAt(front, p.y + 1));
  const pitNext = dir !== 0 && pitColumn(sim, front + facing * 4 * k, feet);
  // Over a pit, take off when the floor ends just past the back foot: the longest jump the feel allows.
  const lastStep = pitColumn(sim, back + facing * 3, feet);
  const targetAbove = ty * ts + ts <= feet - 4 * k && Math.abs(dxPx) < ts * 3;
  const threat = dir !== 0 && hostileAhead(sim, p, facing, k);

  if (p.grounded) {
    mem[PHASE] = 0;
    mem['groundTick'] = tick;
    mem['airJumped'] = 0;
    mem['dashed'] = 0;
    mem['wide'] = 0;
    mem['apexTick'] = -1;
  }
  // Off the ground with no jump made (walked off a ledge): a jump is still on within the coyote time, else falling.
  const coyote = tick - (mem['groundTick'] ?? -99) <= 4;
  if (!p.grounded && (mem[PHASE] ?? 0) === 0 && !coyote) mem[PHASE] = 4;
  const phase = mem[PHASE] ?? 0;
  const released = mem['jumpPrev'] !== 1;
  if (phase === 0) {
    if (released && (escaping || wallAhead || (pitNext && lastStep) || targetAbove || threat)) {
      input.jump = true;
      mem[PHASE] = 1;
      mem['wide'] = pitNext && pitWidth(sim, front + facing * 4 * k, feet, facing) >= WIDE_PIT ? 1 : 0;
    }
  } else if (phase === 1 || phase === 3) {
    // Hold through the rise and the float at the apex; at the first apex, the air jump if one is wanted.
    const atApex = p.vy >= -12 * k;
    if (atApex && (mem['apexTick'] ?? -1) < 0) mem['apexTick'] = tick;
    const wantAir = phase === 1 && hasDouble && mem['airJumped'] !== 1 && (wallAhead || targetAbove || mem['wide'] === 1);
    if (atApex && wantAir) mem[PHASE] = 2;
    else if (p.vy > sim.options.feel.halfGravThreshold) mem[PHASE] = 4;
    else input.jump = true;
  } else if (phase === 2) {
    // Let go for one tick before it, so the air jump is a fresh press.
    input.jump = true;
    mem[PHASE] = 3;
    mem['airJumped'] = 1;
    mem['apexTick'] = -1;
  }
  // The dash over a wide pit: a beat after the last apex, where it carries furthest.
  const apexTick = mem['apexTick'] ?? -1;
  const lastApex = mem['airJumped'] === 1 || !hasDouble;
  if (!p.grounded && hasDash && mem['dashed'] !== 1 && mem['wide'] === 1 && lastApex && apexTick >= 0 && tick - apexTick >= 6) {
    mem['dashed'] = 1;
    input.dash = true;
  }
  mem['jumpPrev'] = input.jump ? 1 : 0;
  return input;
};
