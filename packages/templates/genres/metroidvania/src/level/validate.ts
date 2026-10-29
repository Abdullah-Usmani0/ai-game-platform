import type { LevelJson } from '@gg/schemas';
import { Tilemap, type FeelPreset } from '@gg/sdk';
import { err, report, warn, type Issue, type ValidationReport } from '@gg/validators';
import { COLLECTIBLE_TYPES, DOOR_TILES, DOOR_TYPE, ENTITY_DEFS, RELIC_TYPES } from '../entities.js';
import { progression } from './progress.js';

const ENEMY_TYPES = ENTITY_DEFS.filter((d) => d.fsm).map((d) => d.type);
const SAFE_START_TILES = 8;

/** Air (or a marker tile) with a walkable surface directly below. */
function standable(map: Tilemap, x: number, y: number): boolean {
  const here = map.kindAt(x, y);
  if (here !== 'air' && here !== 'goal' && here !== 'spawn') return false;
  const below = map.kindAt(x, y + 1);
  return below === 'solid' || below === 'oneway';
}

/**
 * Explorer check: spawn and goal sane, doors embedded in solid tiles, nothing else inside walls, a hazard-free start,
 * and the ability-gated progression (relics, keys, doors) reaches the goal. Warns when a relic or door is never used
 * or when the level does not gate at all.
 */
export function validateExplore(level: LevelJson, feel: FeelPreset): ValidationReport {
  const issues: Issue[] = [];
  const map = new Tilemap(level);
  const { spawn, goal } = level;
  if (!standable(map, spawn.x, spawn.y)) issues.push(err('spawn_not_standable', 'spawn is not on a walkable surface', { x: spawn.x, y: spawn.y }));
  if (map.kindAt(spawn.x, spawn.y) === 'hazard' || map.kindAt(spawn.x, spawn.y + 1) === 'hazard') issues.push(err('spawn_on_hazard', 'spawn touches a hazard', { x: spawn.x, y: spawn.y }));
  if (map.kindAt(goal.x, goal.y) !== 'goal') issues.push(err('goal_tile_missing', 'goal coordinates do not point at a goal tile', { x: goal.x, y: goal.y }));
  for (const e of level.entities) {
    if (e.type === DOOR_TYPE) {
      for (let k = 0; k < DOOR_TILES; k++) {
        if (map.kindAt(e.x, e.y - k) !== 'solid') {
          issues.push(err('door_not_embedded', `door at (${e.x},${e.y}) needs ${DOOR_TILES} solid tiles above its position; the passage is open`, { x: e.x, y: e.y }));
          break;
        }
      }
    } else if (map.kindAt(e.x, e.y) === 'solid') issues.push(err('entity_in_solid', `${e.type} at (${e.x},${e.y}) is inside a solid tile`, { x: e.x, y: e.y }));
  }
  let nearHazard: { x: number; y: number } | null = null;
  for (let y = spawn.y - 3; y <= spawn.y + 3 && !nearHazard; y++) {
    for (let x = spawn.x - SAFE_START_TILES; x <= spawn.x + SAFE_START_TILES && !nearHazard; x++) if (map.kindAt(x, y) === 'hazard') nearHazard = { x, y };
  }
  if (nearHazard) issues.push(err('hazard_near_spawn', `hazard at (${nearHazard.x},${nearHazard.y}) within ${SAFE_START_TILES} tiles of the spawn`, nearHazard));

  const prog = progression(level, feel);
  const order = prog.steps.map((s) => s.type).join(' > ');
  if (!prog.goalReachable) issues.push(err('goal_unreachable', `the goal cannot be reached even after ${order || 'no relic or door'}`, { x: goal.x, y: goal.y }));
  for (const r of prog.unreachableRelics) issues.push(warn('relic_unreachable', `${r.type} at (${r.x},${r.y}) is never reachable`, { x: r.x, y: r.y }));
  for (const d of prog.lockedDoors) issues.push(warn('door_never_opened', `door at (${d.x},${d.y}) is never opened (no key reaches it)`, { x: d.x, y: d.y }));
  if (!prog.gated) issues.push(warn('not_gated', 'the goal is reachable without any relic or door'));

  const hazards = level.rows.join('').split('').filter((ch) => level.legend[ch] === 'hazard').length;
  const enemies = level.entities.filter((e) => ENEMY_TYPES.includes(e.type)).length;
  const difficulty = Math.min(1, (hazards / Math.max(1, level.width)) * 0.5 + (enemies / Math.max(1, level.width)) * 4 + prog.steps.length * 0.05);
  return report(issues, {
    progression: order || 'none',
    gated: prog.gated,
    goalReachable: prog.goalReachable,
    relics: level.entities.filter((e) => RELIC_TYPES.includes(e.type)).length,
    doors: level.entities.filter((e) => e.type === DOOR_TYPE).length,
    collectibles: level.entities.filter((e) => COLLECTIBLE_TYPES.includes(e.type)).length,
    enemies,
    hazards,
    reachableTiles: prog.reachableTiles,
    difficultyEstimate: Math.round(difficulty * 100) / 100,
  });
}
