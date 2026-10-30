import type { HintStep, LevelHints, LevelJson } from '@gg/schemas';
import { Tilemap, type FeelPreset } from '@gg/sdk';
import { jumpEnvelope, reachableTiles } from '@gg/validators';

interface Tile {
  x: number;
  y: number;
}

const key = (t: Tile) => `${t.x},${t.y}`;
const tileOf = (k: string): Tile => {
  const [x, y] = k.split(',').map(Number) as [number, number];
  return { x, y };
};

/** Top-down: the floor's shortest walk from one tile to another (four neighbours), or null when there is none. */
function walk(map: Tilemap, from: Tile, to: Tile): Tile[] | null {
  const open = (t: Tile) => t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height && map.kindAt(t.x, t.y) !== 'solid' && map.kindAt(t.x, t.y) !== 'hazard';
  const prev = new Map<string, string>([[key(from), '']]);
  const queue: Tile[] = [from];
  for (let i = 0; i < queue.length && !prev.has(key(to)); i++) {
    const t = queue[i]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (prev.has(key(n)) || !open(n)) continue;
      prev.set(key(n), key(t));
      queue.push(n);
    }
  }
  if (!prev.has(key(to))) return null;
  const path: Tile[] = [];
  for (let k = key(to); k; k = prev.get(k)!) path.push(tileOf(k));
  return path.reverse();
}

/** At most this many waypoints, the goal last (the schema takes twelve steps). */
const MAX_WAYPOINTS = 11;

/**
 * Hints for a level from its tiles alone: waypoints on the way from the spawn to the goal, the goal last. Top-down the
 * way is the floor's shortest walk, a waypoint every few tiles of it; side view, the first standing place a jump
 * reaches in every few columns toward the goal (the way through, not a ledge beside it). Null when there is no way to
 * go: an arena, held where it stands, or a goal no walk reaches. The dry run's answer when a level's hints are asked
 * for, and a fair start for better ones.
 */
export function suggestHints(level: LevelJson, ctx: { movementMode: 'topdown' | 'platformer'; feel: FeelPreset; every?: number; playerH?: number }): LevelHints | null {
  const { spawn, goal } = level;
  if (Math.abs(goal.x - spawn.x) + Math.abs(goal.y - spawn.y) < 4) return null;
  const map = new Tilemap(level);
  let way: Tile[] = [];
  if (ctx.movementMode === 'topdown') {
    const path = walk(map, spawn, goal);
    if (!path) return null;
    const every = Math.max(ctx.every ?? 6, Math.ceil(path.length / (MAX_WAYPOINTS + 1)));
    way = path.filter((_, i) => i > 0 && i % every === 0 && i < path.length - 2);
  } else {
    const ts = level.tileSize;
    const reach = reachableTiles(map, spawn, jumpEnvelope(ctx.feel, ts), Math.max(1, Math.ceil((ctx.playerH ?? 11) / ts)));
    const dir = Math.sign(goal.x - spawn.x) || 1;
    const every = Math.max(ctx.every ?? 8, Math.ceil(Math.abs(goal.x - spawn.x) / (MAX_WAYPOINTS + 1)));
    for (let x = spawn.x + dir * every; dir > 0 ? x < goal.x - 2 : x > goal.x + 2; x += dir * every) {
      let first: { t: Tile; d: number } | null = null;
      for (const [k, d] of reach) {
        const t = tileOf(k);
        if (t.x === x && (!first || d < first.d)) first = { t, d };
      }
      if (first) way.push(first.t);
    }
  }
  const steps: HintStep[] = [...way.slice(0, MAX_WAYPOINTS).map((t) => ({ kind: 'reach' as const, x: t.x, y: t.y, r: 1 })), { kind: 'reach', x: goal.x, y: goal.y, r: 1 }];
  return { version: 1, level: level.id, steps };
}
