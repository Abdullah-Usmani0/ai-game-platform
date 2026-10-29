import type { LevelJson } from '@gg/schemas';
import { Tilemap } from '@gg/sdk';
import { err, report, warn, type Issue, type ValidationReport } from '@gg/validators';
import { BOSS_TYPES, ENTITY_DEFS, HOSTILE_TYPES } from '../entities.js';

const HP: Record<string, number> = Object.fromEntries(ENTITY_DEFS.map((d) => [d.type, d.hp ?? 1]));

/** Breadth-first distances (in tiles, 4-neighbour) from a tile over non-solid tiles. */
export function tileDistances(map: Tilemap, from: { x: number; y: number }): Map<string, number> {
  const dist = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(`${cur.x},${cur.y}`) ?? 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = `${nx},${ny}`;
      if (dist.has(k) || map.kindAt(nx, ny) === 'solid') continue;
      dist.set(k, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

/**
 * Rooms check: walled, goal and every hostile reachable on foot, a safe start (no hostile within 6 tiles
 * of the spawn), a bounded enemy count, and at least one fight before the exit.
 */
export function validateRooms(level: LevelJson): ValidationReport {
  const issues: Issue[] = [];
  const map = new Tilemap(level);
  for (let x = 0; x < map.width; x++) if (map.kindAt(x, 0) !== 'solid' || map.kindAt(x, map.height - 1) !== 'solid') { issues.push(err('rooms_open', 'top/bottom border must be solid')); break; }
  for (let y = 0; y < map.height; y++) if (map.kindAt(0, y) !== 'solid' || map.kindAt(map.width - 1, y) !== 'solid') { issues.push(err('rooms_open', 'left/right border must be solid')); break; }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.kindAt(level.spawn.x + dx, level.spawn.y + dy) === 'solid') { issues.push(err('spawn_blocked', 'spawn needs a clear 3x3', { x: level.spawn.x, y: level.spawn.y })); break; }
  const dist = tileDistances(map, level.spawn);
  const goalDistance = dist.get(`${level.goal.x},${level.goal.y}`);
  if (goalDistance === undefined) issues.push(err('goal_unreachable', 'the goal cannot be reached from the spawn', { x: level.goal.x, y: level.goal.y }));
  const hostiles = level.entities.filter((e) => HOSTILE_TYPES.includes(e.type));
  let nearest = Infinity;
  for (const e of hostiles) {
    const d = dist.get(`${e.x},${e.y}`);
    if (d === undefined) issues.push(err('enemy_unreachable', `${e.type} at ${e.x},${e.y} is sealed off`, { x: e.x, y: e.y }));
    else nearest = Math.min(nearest, d);
  }
  if (nearest < 6) issues.push(err('spawn_unsafe', `a hostile stands ${nearest} tiles from the spawn (minimum 6)`));
  if (hostiles.length === 0) issues.push(warn('no_combat', 'no hostiles: the exit opens immediately'));
  if (hostiles.length > 24) issues.push(err('too_many_enemies', `${hostiles.length} hostiles (maximum 24)`));
  for (const e of level.entities) if (map.kindAt(e.x, e.y) === 'solid') issues.push(err('entity_in_wall', `${e.type} at ${e.x},${e.y} is inside a wall`, { x: e.x, y: e.y }));
  // A boss is two tiles wide and tall (its feet on its tile, its body on the row above): it must stand clear.
  const bosses = hostiles.filter((e) => BOSS_TYPES.includes(e.type));
  for (const b of bosses) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1]] as const) {
      if (map.kindAt(b.x + dx, b.y + dy) === 'solid') {
        issues.push(err('boss_in_wall', `${b.type} at ${b.x},${b.y} overlaps a wall`, { x: b.x, y: b.y }));
        break;
      }
    }
  }
  if (bosses.length > 1) issues.push(err('too_many_bosses', `${bosses.length} bosses on one floor (maximum 1)`));
  const hp = hostiles.reduce((a, e) => a + (HP[e.type] ?? 2), 0);
  return report(issues, { reachableTiles: dist.size, goalDistance: goalDistance ?? -1, enemies: hostiles.length, enemyHp: hp, archers: hostiles.filter((e) => e.type === 'archer').length, bosses: bosses.length });
}
