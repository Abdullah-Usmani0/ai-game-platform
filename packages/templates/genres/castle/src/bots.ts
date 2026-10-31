import { centerX, centerY, emptyInput, isHostile, MOVE, MOVE_TICK, type Entity, type InputState, type Sim } from '@gg/sdk';
import type { BotPolicy } from '@gg/template-core';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP, ALTAR_TYPE, GUARDS, RELIC_ABILITY } from './entities.js';
import { envelopeFor, pathTo, roomOf, tallTiles } from './level/progress.js';

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

/** What the bot heads for changes when an ability, a relic, a rest or the room does: a number that says which. */
function signature(sim: Sim, mem: Record<string, number>): number {
  const p = sim.world.player;
  let live = 0;
  let rested = 0;
  for (const e of sim.world.entities) {
    if (e.alive && RELIC_ABILITY[e.type] !== undefined) live++;
    if (e.type === ALTAR_TYPE && mem[restKey(e)] === 1) rested++;
  }
  // The room too: entering one plans again, so an altar in it is not passed by.
  const t = tileOf(sim, p);
  const room = roomOf(sim.map.level.rooms ?? [], t.x, t.y);
  return (p.flags[ABILITY_DOUBLE_JUMP] === true ? 1 : 0) + (p.flags[ABILITY_DASH] === true ? 2 : 0) + 4 * live + 64 * rested + 4096 * (room + 1);
}

/** An altar is known by its place in the level: a rest reloads the region, and the altar comes back with a new id. */
const restKey = (e: Entity) => `rest${e.levelIndex ?? -e.id}`;

/**
 * Plans the way to an altar in the player's room not rested at yet (a rest is not to be flown past), else to the nearest
 * relic the player can reach now (a standing tile it can be touched from: under it, within a jump), else to the goal: a
 * shortest walk over the jump graph from the tile the player stands on, kept in memory.
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
  const rooms = sim.map.level.rooms ?? [];
  const room = roomOf(rooms, from.x, from.y);
  const altar = sim.world.entities.find((e) => e.alive && e.type === ALTAR_TYPE && mem[restKey(e)] !== 1 && room >= 0 && roomOf(rooms, tileOf(sim, e).x, tileOf(sim, e).y) === room);
  const at = altar ? tileOf(sim, altar) : null;
  const toAltar = at ? way((x, y) => y === at.y && Math.abs(x - at.x) <= 1) : null;
  const toRelic = !toAltar && relics.length > 0 ? way((x, y) => touches(x, y) !== undefined) : null;
  const path = toAltar ?? toRelic ?? way((x, y) => x === goal.x && (y === goal.y || y === goal.y - 1)) ?? [from];
  const end = path[path.length - 1]!;
  const relic = toRelic ? touches(end.x, end.y)! : null;
  const target = toAltar && at ? at : (relic ?? goal);
  mem[PLAN_X] = target.x;
  mem[PLAN_Y] = target.y;
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
  // The tile itself first, then one beside it.
  for (const near of [0, 1]) for (let i = at; i < n && i <= at + 16; i++) if (mem[`py${i}`] === t.y && Math.abs((mem[`px${i}`] ?? -99) - t.x) <= near) return i;
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

/**
 * How far from the hero's middle its first cut reaches, with the foe's approach over the cut's wind-up allowed for, and
 * how high above its feet the cut's box stands (the castle's moves: the cut's box runs 2 to 38 px ahead, up to 46 px up).
 */
const CUT_REACH = 44;
const CUT_HIGH = 46;

/** How far ahead a foe on the hero's floor is waited for before a jump over a pit, and for how long at most. */
const WAIT_REACH = 112;
const WAIT_TICKS = 75;

/** An awake foe on the hero's own floor, up to WAIT_REACH ahead: one a leap over a pit would meet in the air. */
function foeComing(sim: Sim, p: Entity, facing: number): boolean {
  const cx = centerX(p);
  const feet = p.y + p.h;
  return sim.world.entities.some((e) => {
    if (!isHostile(e) || e.dormant === true || e.isProjectile) return false;
    const dx = (centerX(e) - cx) * facing;
    return dx > 0 && dx <= WAIT_REACH && Math.abs(e.y + e.h - feet) <= 16;
  });
}

/** The nearest awake foe a cut would reach from where the hero stands, either way it turns (null: none). */
function foeInReach(sim: Sim, p: Entity): Entity | null {
  const cx = centerX(p);
  const feet = p.y + p.h;
  let best: Entity | null = null;
  let bestGap = Infinity;
  for (const e of sim.world.entities) {
    if (!isHostile(e) || e.dormant === true || e.isProjectile) continue;
    const gap = e.x >= cx ? e.x - cx : cx - (e.x + e.w);
    if (gap > CUT_REACH || e.y + e.h < feet - CUT_HIGH || e.y > feet) continue;
    if (gap < bestGap) {
      best = e;
      bestGap = gap;
    }
  }
  return best;
}

/** How near (centre to centre) a shield-bearer ahead on the hero's floor is fought as below rather than run at. */
const SHIELD_WATCH = 120;
/**
 * A raised shield is baited, never cut (it only throws the cut back): the bot comes within BAIT_NEAR (just outside the
 * thrust's trigger), backs off past its reach to BAIT_SAFE while it winds up, and steps in to cut once the thrust has
 * swung the shield open.
 */
const BAIT_NEAR = 46;
const BAIT_SAFE = 70;
/**
 * A thrust that will reach the hero is parried rather than run from: the guard pressed as the thrust's clock reaches
 * PARRY_AT (its window then covers the thrust's first blows) when the bearer is within PARRY_REACH; the riposte follows.
 */
const PARRY_AT = 19;
const PARRY_REACH = 60;
/** A flask is drunk at this many hearts or fewer, standing, with no foe within CLEAR_REACH. */
const DRINK_AT = 2;
const CLEAR_REACH = 160;

/** The nearest awake shield-bearer ahead (`way`) on the hero's floor within SHIELD_WATCH, with no pit between (null: none). */
function shieldAhead(sim: Sim, p: Entity, way: number): Entity | null {
  const cx = centerX(p);
  const feet = p.y + p.h;
  let best: Entity | null = null;
  for (const e of sim.world.entities) {
    if (!e.alive || e.dormant === true || GUARDS[e.type] === undefined || Math.abs(e.y + e.h - feet) > 16) continue;
    const dx = centerX(e) - cx;
    if (dx * way <= 0 || Math.abs(dx) > SHIELD_WATCH || (best && Math.abs(dx) >= Math.abs(centerX(best) - cx))) continue;
    let pit = false;
    for (let x = cx; (centerX(e) - x) * way > 0 && !pit; x += way * 8) pit = pitColumn(sim, x, feet);
    if (!pit) best = e;
  }
  return best;
}

/** A shot coming at the hero that a cut would strike from where it stands (null: none): cut out of the air. */
function shotInReach(sim: Sim, p: Entity): Entity | null {
  const cx = centerX(p);
  const feet = p.y + p.h;
  for (const e of sim.world.entities) {
    if (!e.alive || !e.isProjectile || e.contactDamage <= 0) continue;
    const dx = centerX(e) - cx;
    if (Math.abs(dx) > CUT_REACH || dx * e.vx >= 0 || e.y + e.h < feet - CUT_HIGH || e.y > feet) continue;
    return e;
  }
  return null;
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
  const sig = signature(sim, mem);
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

  // A foe within a cut's reach, met on the ground: the hero stands and cuts it down (below), which is no stall.
  const near = p.grounded ? foeInReach(sim, p) : null;
  // A shield-bearer ahead on the hero's floor: fought as below (baited while its shield is raised toward the hero), which
  // is no stall either.
  const shield = p.grounded ? shieldAhead(sim, p, dxPx === 0 ? p.facing : Math.sign(dxPx)) : null;
  const shut = shield !== null && shield.flags['guarding'] === true && (cx - centerX(shield)) * shield.facing > 0;
  // Stall breaker: standing still on the ground for 90 ticks (longer than any wait for a foe) turns back for 24 ticks
  // with a jump.
  if (p.grounded && !near && !shield && Math.abs(p.x - (mem['lastX'] ?? -1)) < 0.5) mem['still'] = (mem['still'] ?? 0) + 1;
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
    const rested = restKey(e);
    if (!e.alive || e.type !== ALTAR_TYPE || mem[rested] === 1) continue;
    if (Math.abs(centerX(e) - cx) <= e.w / 2 + 4 && Math.abs(centerY(e) - centerY(p)) <= e.h / 2 + 4) {
      mem[rested] = 1;
      input.up = true;
    }
  }

  // Cut it down: the chain, a fresh press every other tick, turned toward it, rather than running into it or leaping it;
  // but never a raised shield.
  const foe = escaping || (shut && near === shield) ? null : near;
  if (foe) {
    const toward = centerX(foe) < cx ? -1 : 1;
    input.left = toward < 0;
    input.right = toward > 0;
    input.action = tick % 2 === 0;
  }
  // A shot coming at the hero within a cut's reach (a low one is jumped before it gets there): cut out of the air.
  const shot = p.grounded && !foe && !escaping ? shotInReach(sim, p) : null;
  if (shot) {
    const toward = centerX(shot) < cx ? -1 : 1;
    input.left = toward < 0;
    input.right = toward > 0;
    input.action = tick % 2 === 0;
  }
  // Bait a raised shield: in to just outside its thrust's trigger, then out of its reach as the thrust winds up; once the
  // thrust swings the shield open (or the bearer turns or reels) it is cut down as above.
  if (shut && shield && !escaping && !foe && !shot) {
    const d = Math.abs(centerX(shield) - cx);
    const toward = centerX(shield) < cx ? -1 : 1;
    const winding = typeof shield.props[MOVE] === 'string' && shield.props[MOVE] !== '';
    // Close enough to be reached: stand and parry as it comes (a fresh press as its clock reaches PARRY_AT).
    const parrying = winding && d <= PARRY_REACH;
    const step = parrying ? 0 : winding ? (d < BAIT_SAFE ? -toward : 0) : d > BAIT_NEAR ? toward : 0;
    input.left = step < 0;
    input.right = step > 0;
    if (parrying && Number(shield.props[MOVE_TICK] ?? 0) === PARRY_AT) input.guard = true;
  }
  // Low on hearts with a flask in hand and nothing hostile near: stand and drink.
  const clear = !sim.world.entities.some((e) => isHostile(e) && e.dormant !== true && Math.abs(centerX(e) - cx) < CLEAR_REACH && Math.abs(centerY(e) - centerY(p)) < CLEAR_REACH);
  if (p.grounded && !foe && !shot && p.hp <= DRINK_AT && Number(p.props['flasks'] ?? 0) > 0 && clear) {
    input.left = false;
    input.right = false;
    input.item = tick % 4 === 0;
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

  // A foe coming over the way ahead as the hero is about to leap a pit: wait for it on solid ground (it comes into reach,
  // or falls into the pit) rather than leap into it; for a while at most, as one that keeps its place would hold the
  // way forever.
  const wait = p.grounded && !foe && pitNext && foeComing(sim, p, facing);
  if (!wait) mem['waitFrom'] = -1;
  else if ((mem['waitFrom'] ?? -1) < 0) mem['waitFrom'] = tick;
  const waiting = wait && tick - (mem['waitFrom'] ?? tick) < WAIT_TICKS;
  if (waiting) {
    input.left = false;
    input.right = false;
  }

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
    if (released && !foe && !shield && !waiting && (escaping || wallAhead || (pitNext && lastStep) || targetAbove || threat || (jumpMove && edgeAhead && !pitNext))) {
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
