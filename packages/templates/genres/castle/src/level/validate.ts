import type { LevelJson } from '@gg/schemas';
import { Tilemap, type FeelPreset } from '@gg/sdk';
import { err, report, warn, type Issue, type ValidationReport } from '@gg/validators';
import { ALTAR_TYPE, COLLECTIBLE_TYPES, ENEMY_TYPES, GATE_TYPE, RELIC_TYPES } from '../entities.js';
import { MAX_STRETCH, roomOf, world } from './progress.js';

/** The castle tier's tiles. */
export const CASTLE_TILE = 16;
const SAFE_START_TILES = 8;

/** Air (or a marker tile) with a walkable surface directly below. */
function standable(map: Tilemap, x: number, y: number): boolean {
  const here = map.kindAt(x, y);
  if (here !== 'air' && here !== 'goal' && here !== 'spawn') return false;
  const below = map.kindAt(x, y + 1);
  return below === 'solid' || below === 'oneway';
}

/**
 * Region check: 16 px tiles, spawn and goal sane, nothing inside walls, a hazard-free start, and rooms: every tile the
 * player stands on in one, the goal in an exit room, an altar in every save room. Then the world solver: the relics in
 * order reach the goal, nothing the player can get to strands them, every room is reached, and no stretch between
 * rests runs past MAX_STRETCH rooms. Warns when a relic or an altar is never reached or the region does not gate.
 */
export function validateRegion(level: LevelJson, feel: FeelPreset): ValidationReport {
  const issues: Issue[] = [];
  if (level.tileSize !== CASTLE_TILE) issues.push(err('tile_size', `a castle region is drawn in ${CASTLE_TILE} px tiles, not ${level.tileSize}`));
  const map = new Tilemap(level);
  const { spawn, goal } = level;
  const rooms = level.rooms ?? [];
  if (!standable(map, spawn.x, spawn.y)) issues.push(err('spawn_not_standable', 'spawn is not on a walkable surface', { x: spawn.x, y: spawn.y }));
  if (map.kindAt(spawn.x, spawn.y) === 'hazard' || map.kindAt(spawn.x, spawn.y + 1) === 'hazard') issues.push(err('spawn_on_hazard', 'spawn touches a hazard', { x: spawn.x, y: spawn.y }));
  if (map.kindAt(goal.x, goal.y) !== 'goal') issues.push(err('goal_tile_missing', 'goal coordinates do not point at a goal tile', { x: goal.x, y: goal.y }));
  // A gate stands in the floor it closes; nothing else stands in rock.
  for (const e of level.entities) if (e.type !== GATE_TYPE && map.kindAt(e.x, e.y) === 'solid') issues.push(err('entity_in_solid', `${e.type} at (${e.x},${e.y}) is inside a solid tile`, { x: e.x, y: e.y }));
  let nearHazard: { x: number; y: number } | null = null;
  for (let y = spawn.y - 3; y <= spawn.y + 3 && !nearHazard; y++) {
    for (let x = spawn.x - SAFE_START_TILES; x <= spawn.x + SAFE_START_TILES && !nearHazard; x++) if (map.kindAt(x, y) === 'hazard') nearHazard = { x, y };
  }
  if (nearHazard) issues.push(err('hazard_near_spawn', `hazard at (${nearHazard.x},${nearHazard.y}) within ${SAFE_START_TILES} tiles of the spawn`, nearHazard));

  if (rooms.length === 0) issues.push(err('no_rooms', 'a region lists its rooms'));
  else {
    if (roomOf(rooms, spawn.x, spawn.y) < 0) issues.push(err('spawn_outside_rooms', 'the spawn is in no room', { x: spawn.x, y: spawn.y }));
    const goalRoom = rooms[roomOf(rooms, goal.x, goal.y)];
    if (!goalRoom) issues.push(err('goal_outside_rooms', 'the goal is in no room', { x: goal.x, y: goal.y }));
    else if (goalRoom.kind !== 'exit') issues.push(warn('goal_not_in_exit', `the goal is in ${goalRoom.id}, a ${goalRoom.kind} room, not an exit`, { x: goal.x, y: goal.y }));
    for (const r of rooms) {
      if (r.kind !== 'save') continue;
      const inside = level.entities.some((e) => e.type === ALTAR_TYPE && e.x >= r.x && e.x < r.x + r.w && e.y >= r.y && e.y < r.y + r.h);
      if (!inside) issues.push(err('save_without_altar', `save room ${r.id} has no altar`, { path: r.id }));
    }
    for (const a of level.entities) {
      if (a.type !== ALTAR_TYPE) continue;
      const r = rooms[roomOf(rooms, a.x, a.y)];
      if (r?.kind !== 'save') issues.push(warn('altar_outside_save', `the altar at (${a.x},${a.y}) is not in a save room`, { x: a.x, y: a.y }));
    }
    // Every standing tile is in a room: the camera holds to rooms, so a tile outside them is never framed.
    let loose: { x: number; y: number } | null = null;
    for (let y = 0; y < level.height && !loose; y++) for (let x = 0; x < level.width && !loose; x++) if (standable(map, x, y) && roomOf(rooms, x, y) < 0) loose = { x, y };
    if (loose) issues.push(err('tile_outside_rooms', `the floor at (${loose.x},${loose.y}) is in no room`, loose));
  }

  const w = world(level, feel);
  const order = w.steps.map((s) => s.type).join(' > ');
  if (!w.goalReachable) issues.push(err('goal_unreachable', `the goal cannot be reached even after ${order || 'no relic'}`, { x: goal.x, y: goal.y }));
  if (w.trap) issues.push(err('softlock', `a player who gets to (${w.trap.x},${w.trap.y}) can never leave it`, w.trap));
  for (const r of w.unreachableRelics) issues.push(warn('relic_unreachable', `${r.type} at (${r.x},${r.y}) is never reachable`, { x: r.x, y: r.y }));
  for (const a of w.unreachableAltars) issues.push(warn('altar_unreachable', `the altar at (${a.x},${a.y}) is never reachable`, { x: a.x, y: a.y }));
  for (const g of w.closedGates) issues.push(warn('gate_unreachable', `the gate at (${g.x},${g.y}) is never reached from below`, { x: g.x, y: g.y }));
  for (const g of w.oneWayGates) issues.push(warn('gate_one_way', `the gate at (${g.x},${g.y}) opens, but its shaft joins its rooms one way only`, { x: g.x, y: g.y }));
  for (const r of w.unreachableRooms) issues.push(err('room_unreachable', `room ${r.id} is never reached`, { path: r.id }));
  if (w.longestStretch.length > MAX_STRETCH) issues.push(err('altars_far_apart', `${w.longestStretch.length} rooms in a row with no altar: ${w.longestStretch.join(', ')} (at most ${MAX_STRETCH})`));
  if (!w.gated) issues.push(warn('not_gated', 'the goal is reachable without any relic'));

  const hazards = level.rows.join('').split('').filter((ch) => level.legend[ch] === 'hazard').length;
  const enemies = level.entities.filter((e) => ENEMY_TYPES.includes(e.type)).length;
  const difficulty = Math.min(1, (hazards / Math.max(1, level.width)) * 0.5 + (enemies / Math.max(1, level.width)) * 8 + w.steps.length * 0.1);
  return report(issues, {
    progression: order || 'none',
    gated: w.gated,
    // The relics the way out needs, one gate each (none when the goal is reachable without them).
    abilityGates: w.gated ? w.steps.length : 0,
    // Gates the player opens from below that join a late room to a rest both ways: a loop through the region.
    shortcutLoops: w.shortcuts.length,
    goalReachable: w.goalReachable,
    rooms: rooms.length,
    saves: rooms.filter((r) => r.kind === 'save').length,
    longestStretch: w.longestStretch.length,
    relics: level.entities.filter((e) => RELIC_TYPES.includes(e.type)).length,
    collectibles: level.entities.filter((e) => COLLECTIBLE_TYPES.includes(e.type)).length,
    enemies,
    hazards,
    reachableTiles: w.reachableTiles,
    difficultyEstimate: Math.round(difficulty * 100) / 100,
  });
}
