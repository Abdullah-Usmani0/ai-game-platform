import type { LevelJson } from '@gg/schemas';
import { Tilemap, type FeelPreset } from '@gg/sdk';
import { jumpEnvelope, type Envelope } from './jump-envelope.js';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

export interface LevelValidationOptions {
  feel: FeelPreset;
  /** Entity types that count as collectibles for the reachability check. */
  collectibleTypes?: string[];
  /** Require a hazard-free run of at least this many tiles from the spawn (the "can't-fail first 30 s" rule). */
  safeStartTiles?: number;
  envelope?: Envelope;
}

interface Node {
  x: number;
  y: number;
}

/** A tile is "standing" when it is air with a walkable surface directly below (solid or one-way). */
function standable(map: Tilemap, x: number, y: number): boolean {
  const here = map.kindAt(x, y);
  if (here !== 'air' && here !== 'goal' && here !== 'spawn') return false;
  const below = map.kindAt(x, y + 1);
  return below === 'solid' || below === 'oneway';
}

function free(map: Tilemap, x: number, y: number): boolean {
  const k = map.kindAt(x, y);
  return k === 'air' || k === 'goal' || k === 'spawn' || k === 'oneway';
}

/** Player occupies ~2 tiles tall at 8px tiles (h=11px). Require the tile above to be free too. */
function fits(map: Tilemap, x: number, y: number, tallTiles: number): boolean {
  for (let i = 0; i < tallTiles; i++) if (!free(map, x, y - i)) return false;
  return true;
}

/** Columns between a and b (exclusive of a) must be free at row y for the horizontal part of a jump. */
function corridorFree(map: Tilemap, x0: number, x1: number, y: number, tallTiles: number): boolean {
  const step = Math.sign(x1 - x0) || 1;
  for (let x = x0 + step; step > 0 ? x <= x1 : x >= x1; x += step) if (!fits(map, x, y, tallTiles)) return false;
  return true;
}

/**
 * BFS over standing tiles with walk, jump and fall edges from the feel envelope.
 * Returns the set of reachable standing tiles and the BFS distance map.
 */
export function reachableTiles(map: Tilemap, start: Node, env: Envelope, tallTiles: number): Map<string, number> {
  const key = (n: Node) => `${n.x},${n.y}`;
  const dist = new Map<string, number>();
  const queue: Node[] = [start];
  dist.set(key(start), 0);
  while (queue.length > 0) {
    const n = queue.shift()!;
    const d = dist.get(key(n))!;
    const push = (m: Node) => {
      const k = key(m);
      if (dist.has(k)) return;
      dist.set(k, d + 1);
      queue.push(m);
    };
    // Walk left/right along the surface; drop off ledges.
    for (const dx of [-1, 1]) {
      const x = n.x + dx;
      if (!fits(map, x, n.y, tallTiles)) continue;
      if (standable(map, x, n.y)) push({ x, y: n.y });
      else {
        // Fall straight down until standing or hazard.
        for (let y = n.y + 1; y <= n.y + env.maxDropTiles && y < map.height; y++) {
          if (!free(map, x, y)) break;
          if (standable(map, x, y)) {
            push({ x, y });
            break;
          }
        }
      }
    }
    // Jumps and arcs: every (dx, dy) inside the envelope whose landing tile is standable and whose corridor is free.
    for (let dy = -env.jumpUpTiles; dy <= env.maxDropTiles; dy++) {
      const maxDx = env.maxDx.get(dy) ?? (dy < 0 ? 0 : env.maxDx.get(env.maxDropTiles) ?? 0);
      for (let adx = 0; adx <= maxDx; adx++) {
        for (const sign of adx === 0 ? [1] : [-1, 1]) {
          const x = n.x + sign * adx;
          const y = n.y + dy;
          if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
          if (!standable(map, x, y) || !fits(map, x, y, tallTiles)) continue;
          // Rising part: the column above the start must be free up to the apex row (one tile above the lower of
          // start and landing, so ground-level hazards are cleared); then a free corridor along the apex row.
          const apexY = Math.max(0, Math.min(n.y, y) - 1);
          let clear = true;
          for (let yy = n.y; yy >= apexY; yy--) if (!fits(map, n.x, yy, tallTiles)) { clear = false; break; }
          if (clear && adx > 0) clear = corridorFree(map, n.x, x, apexY, tallTiles);
          if (clear) push({ x, y });
        }
      }
    }
  }
  return dist;
}

export function validateLevel(level: LevelJson, opts: LevelValidationOptions): ValidationReport {
  const issues: Issue[] = [];
  const map = new Tilemap(level);
  const env = opts.envelope ?? jumpEnvelope(opts.feel, level.tileSize);
  const tallTiles = Math.max(1, Math.ceil(11 / level.tileSize));
  const spawn = { x: level.spawn.x, y: level.spawn.y };
  const goal = { x: level.goal.x, y: level.goal.y };

  if (!standable(map, spawn.x, spawn.y)) issues.push(err('spawn_not_standable', 'spawn is not on a walkable surface', { x: spawn.x, y: spawn.y }));
  if (map.kindAt(spawn.x, spawn.y + 1) === 'hazard' || map.kindAt(spawn.x, spawn.y) === 'hazard') issues.push(err('spawn_on_hazard', 'spawn touches a hazard', { x: spawn.x, y: spawn.y }));
  if (map.kindAt(goal.x, goal.y) !== 'goal') issues.push(err('goal_tile_missing', 'goal coordinates do not point at a goal tile', { x: goal.x, y: goal.y }));

  const dist = reachableTiles(map, spawn, env, tallTiles);
  const goalReachable = [goal, { x: goal.x, y: goal.y - 1 }].some((g) => dist.has(`${g.x},${g.y}`)) || dist.has(`${goal.x},${goal.y + 0}`);
  if (!goalReachable) issues.push(err('goal_unreachable', 'no path from spawn to goal under the feel preset', { x: goal.x, y: goal.y }));
  const pathLen = dist.get(`${goal.x},${goal.y}`) ?? -1;

  // Collectibles must be reachable (standing tile at or just below the item, or within a jump above a standing tile).
  const collectibles = level.entities.filter((e) => (opts.collectibleTypes ?? ['coin']).includes(e.type));
  let unreachable = 0;
  for (const c of collectibles) {
    let ok = false;
    for (let dy = 0; dy <= env.jumpUpTiles + 1 && !ok; dy++) if (dist.has(`${c.x},${c.y + dy}`)) ok = true;
    if (!ok) {
      unreachable++;
      issues.push(warn('collectible_unreachable', `collectible ${c.type} at (${c.x},${c.y}) is not reachable`, { x: c.x, y: c.y }));
    }
  }

  // Can't-fail start: no hazard within N tiles of the spawn along the walkable surface.
  const safe = opts.safeStartTiles ?? 12;
  for (let x = spawn.x; x < Math.min(map.width, spawn.x + safe); x++) {
    for (let y = 0; y < map.height; y++) {
      if (map.kindAt(x, y) === 'hazard' && Math.abs(y - spawn.y) <= 3) {
        issues.push(err('hazard_near_spawn', `hazard at (${x},${y}) within the safe start zone`, { x, y }));
        y = map.height;
        x = map.width;
      }
    }
  }

  // Enemies spawning inside solids or on hazards.
  for (const e of level.entities) {
    if (map.kindAt(e.x, e.y) === 'solid') issues.push(err('entity_in_solid', `${e.type} at (${e.x},${e.y}) is inside a solid tile`, { x: e.x, y: e.y }));
  }

  const hazards = level.rows.join('').split('').filter((ch) => level.legend[ch] === 'hazard').length;
  const solids = level.rows.join('').split('').filter((ch) => level.legend[ch] === 'solid').length;
  const difficulty = Math.min(1, (hazards / Math.max(1, level.width)) * 0.5 + (level.entities.filter((e) => !(opts.collectibleTypes ?? ['coin']).includes(e.type)).length / Math.max(1, level.width)) * 2);
  return report(issues, {
    reachableTiles: dist.size,
    pathLength: pathLen,
    goalReachable,
    collectibles: collectibles.length,
    unreachableCollectibles: unreachable,
    hazards,
    solids,
    jumpUpTiles: env.jumpUpTiles,
    difficultyEstimate: Math.round(difficulty * 100) / 100,
  });
}

/** Difficulty must not drop between consecutive levels by more than `tolerance`. */
export function validateRamp(levels: Array<{ id: string; difficulty: number }>, tolerance = 0.15): ValidationReport {
  const issues: Issue[] = [];
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1]!;
    const cur = levels[i]!;
    if (cur.difficulty + tolerance < prev.difficulty) issues.push(warn('ramp_not_monotonic', `${cur.id} (${cur.difficulty}) is easier than ${prev.id} (${prev.difficulty})`));
  }
  const first = levels[0];
  if (first && first.difficulty > 0.4) issues.push(err('first_level_too_hard', `first level difficulty ${first.difficulty} > 0.4`));
  return report(issues, { levels: levels.length });
}
