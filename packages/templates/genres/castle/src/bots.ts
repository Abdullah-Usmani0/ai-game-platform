import { centerX, centerY, emptyInput, type Entity, type InputState, type Sim } from '@gg/sdk';
import type { BotPolicy } from '@gg/template-core';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP, ALTAR_TYPE, RELIC_ABILITY } from './entities.js';
import { envelopeFor, pathTo, tallTiles } from './level/progress.js';

/** Tiles of hazard ahead (columns whose first floor down is spikes or the void) that need the air abilities. */
const WIDE_PIT = 4;
/**
 * The bot's memory keys: the plan's signature and target (the relic it heads for, or the goal), the way there (PATH_N
 * tiles at `px<i>`, `py<i>`, and AT, the one it last stood on), the waypoint it steers for, and how far through a jump
 * it is.
 */
const PLAN_SIG = 'sig';
const PLAN_X = 'tx';
const PLAN_Y = 'ty';
const PATH_N = 'pn';
const AT = 'at';
const WX = 'wx';
const WY = 'wy';
/** Walking steps along one row the waypoint runs ahead by: the bot keeps running through them. */
const LOOK_AHEAD = 5;
/** How far across a run off an edge carries the body on its way down a few rows: further needs a jump. */
const DRIFT_TILES = 3;
/** Tiles of reach a planned jump keeps in hand where the region allows it. */
const SPARE_TILES = 2;
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

/**
 * Plans the way to the nearest relic the player can reach now (a standing tile it can be touched from: under it, within a
 * jump), else to the goal: a shortest walk over the jump graph from the tile the player stands on, kept in memory.
 */
function plan(sim: Sim, mem: Record<string, number>): void {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const env = envelopeFor(sim.options.feel, ts, { doubleJump: p.flags[ABILITY_DOUBLE_JUMP] === true, dash: p.flags[ABILITY_DASH] === true });
  const relics = sim.world.entities.filter((e) => e.alive && RELIC_ABILITY[e.type] !== undefined).map((e) => tileOf(sim, e));
  const goal = sim.options.level.goal;
  const touches = (x: number, y: number) => relics.find((r) => r.x === x && y >= r.y && y <= r.y + env.jumpUpTiles + 1);
  const from = tileOf(sim, p);
  // A way with a tile of reach to spare on every jump where there is one (the envelope's farthest needs a perfect run-up).
  const way = (isTarget: (x: number, y: number) => boolean) => pathTo(sim.map, from, isTarget, env, tallTiles(ts), SPARE_TILES) ?? pathTo(sim.map, from, isTarget, env, tallTiles(ts));
  const toRelic = relics.length > 0 ? way((x, y) => touches(x, y) !== undefined) : null;
  const path = toRelic ?? way((x, y) => x === goal.x && (y === goal.y || y === goal.y - 1)) ?? [from];
  const end = path[path.length - 1]!;
  const relic = toRelic ? touches(end.x, end.y)! : null;
  mem[PLAN_X] = relic ? relic.x : goal.x;
  mem[PLAN_Y] = relic ? relic.y : goal.y;
  mem[PATH_N] = path.length;
  for (const [i, t] of path.entries()) {
    mem[`px${i}`] = t.x;
    mem[`py${i}`] = t.y;
  }
  mem[AT] = 0;
}

/**
 * Where on the planned way the player stands, from AT on: a tile of it or one beside it on the same row, or on the
 * floor of tile AT on the way to the next move's take-off (a jump's corridor holds no path tiles); -1 off it.
 */
function placeOnPath(mem: Record<string, number>, t: { x: number; y: number }): number {
  const n = mem[PATH_N] ?? 0;
  const at = mem[AT] ?? 0;
  for (let i = at; i < n && i <= at + 16; i++) if (mem[`py${i}`] === t.y && Math.abs((mem[`px${i}`] ?? -99) - t.x) <= 1) return i;
  const ax = mem[`px${at}`] ?? -99;
  const bx = mem[`px${at + 1}`] ?? ax;
  if (mem[`py${at}`] === t.y && t.x >= Math.min(ax, bx) && t.x <= Math.max(ax, bx)) return at;
  return -1;
}

/** The waypoint from path tile `i`: along a run of walking steps on one row up to LOOK_AHEAD ahead, then the next move's landing. */
function waypoint(mem: Record<string, number>, i: number): { x: number; y: number } {
  const n = mem[PATH_N] ?? 0;
  if (i >= n - 1) return { x: mem[PLAN_X] ?? 0, y: mem[PLAN_Y] ?? 0 };
  let j = i;
  while (j < n - 1 && j - i < LOOK_AHEAD && mem[`py${j + 1}`] === mem[`py${j}`] && Math.abs((mem[`px${j + 1}`] ?? 0) - (mem[`px${j}`] ?? 0)) === 1) j++;
  const k = Math.min(n - 1, j === i ? i + 1 : j);
  return { x: mem[`px${k}`] ?? 0, y: mem[`py${k}`] ?? 0 };
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
  if (p.grounded) {
    // On the ground: where on the way the player stands; a new plan when an ability or a relic changed, or when they
    // stand off the way (a jump that landed short, a knock back, the region loaded again at an altar).
    const here = tileOf(sim, p);
    let at = mem[PLAN_SIG] === sig ? placeOnPath(mem, here) : -1;
    if (at < 0) {
      plan(sim, mem);
      mem[PLAN_SIG] = sig;
      at = 0;
    }
    mem[AT] = at;
    const w = waypoint(mem, at);
    mem[WX] = w.x;
    mem[WY] = w.y;
  }
  const tx = mem[WX] ?? sim.options.level.goal.x;
  const ty = mem[WY] ?? sim.options.level.goal.y;
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
  // The next move on the way is a jump when it lands higher up, two tiles or more along the same row, or further down
  // than a run off the edge drifts (DRIFT_TILES): taken where the ground ends under the front foot. A move down closer in
  // is a drop off the edge (a jump would rise and come down on the ledge above).
  const here = tileOf(sim, p);
  const nx = mem[`px${(mem[AT] ?? 0) + 1}`];
  const ny = mem[`py${(mem[AT] ?? 0) + 1}`];
  const jumpMove = nx !== undefined && ny !== undefined && (ny < here.y || Math.abs(nx - here.x) > (ny > here.y ? DRIFT_TILES : 1));
  // What the move needs: the plain jump's reach at its height with a tile to spare (a short run-up falls short of the
  // envelope's best), else the wings', else the dash as well.
  const reaches = (a: { doubleJump: boolean; dash: boolean }) => {
    if (nx === undefined || ny === undefined) return true;
    const env = envelopeFor(sim.options.feel, ts, a);
    const dy = ny - here.y;
    return (env.maxDx.get(dy) ?? (dy < 0 ? 0 : (env.maxDx.get(env.maxDropTiles) ?? 0))) >= Math.abs(nx - here.x) + 1;
  };
  const groundAt = (px: number) => {
    const kind = sim.map.kindAtPx(px, feet + 1);
    return kind === 'solid' || kind === 'oneway';
  };
  const edgeAhead = dir !== 0 && !groundAt(front + facing * 2);

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
    // Over a pit, the last step (the longest jump); off any other edge the way jumps from, at the edge.
    if (released && (escaping || wallAhead || (pitNext && lastStep) || targetAbove || threat || (jumpMove && edgeAhead && !pitNext))) {
      input.jump = true;
      mem[PHASE] = 1;
      const needAir = jumpMove && hasDouble && !reaches({ doubleJump: false, dash: false });
      const needDash = jumpMove && hasDash && !reaches({ doubleJump: hasDouble, dash: false });
      mem['needAir'] = needAir ? 1 : 0;
      mem['wide'] = needDash || (pitNext && pitWidth(sim, front + facing * 4 * k, feet, facing) >= WIDE_PIT) ? 1 : 0;
    }
  } else if (phase === 1 || phase === 3) {
    // Hold through the rise and the float at the apex; at the first apex, the air jump if one is wanted.
    const atApex = p.vy >= -12 * k;
    if (atApex && (mem['apexTick'] ?? -1) < 0) mem['apexTick'] = tick;
    const wantAir = phase === 1 && hasDouble && mem['airJumped'] !== 1 && (wallAhead || targetAbove || mem['wide'] === 1 || mem['needAir'] === 1);
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
