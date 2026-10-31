import type { LevelEntity, LevelJson, LevelRoom } from '@gg/schemas';
import { Tilemap, type FeelPreset } from '@gg/sdk';
import { jumpEnvelope, jumpNeighbours, reachableTiles, type Envelope } from '@gg/validators';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP, ALTAR_TYPE, PLAYER, RELIC_ABILITY } from '../entities.js';

export interface Abilities {
  doubleJump: boolean;
  dash: boolean;
}

export const NO_ABILITIES: Abilities = { doubleJump: false, dash: false };

/** A room may hold this many rooms in a row with no altar (or the start) among them: a stretch between rests. */
export const MAX_STRETCH = 4;

const envelopes = new WeakMap<FeelPreset, Map<string, Envelope>>();

/** The jump envelope for an ability set, in the exact air-speed mode the gates are sized against. Cached. */
export function envelopeFor(feel: FeelPreset, tileSize: number, a: Abilities): Envelope {
  let byKey = envelopes.get(feel);
  if (!byKey) {
    byKey = new Map();
    envelopes.set(feel, byKey);
  }
  const key = `${tileSize}|${a.doubleJump ? 1 : 0}|${a.dash ? 1 : 0}`;
  let env = byKey.get(key);
  if (!env) {
    env = jumpEnvelope(feel, tileSize, 12, { exactAir: true, airJumps: a.doubleJump ? 1 : 0, dash: a.dash });
    byKey.set(key, env);
  }
  return env;
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * The way from a standing tile to the nearest tile that is a target, over the moves a bot can make (moves, with `spare`
 * tiles of reach to spare on every jump), tile by tile from `from` (included) to the target (included); null when no
 * target can be reached. A breadth-first search, so the way is one of the shortest in moves. For bots, which keep to
 * GlueTS imports.
 */
export function pathTo(map: Tilemap, from: { x: number; y: number }, isTarget: (x: number, y: number) => boolean, env: Envelope, tall: number, spare = 0): Array<{ x: number; y: number }> | null {
  const parent = new Map<string, { x: number; y: number } | null>([[key(from.x, from.y), null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]!;
    if (isTarget(n.x, n.y)) {
      const path: Array<{ x: number; y: number }> = [];
      for (let t: { x: number; y: number } | null = n; t; t = parent.get(key(t.x, t.y)) ?? null) path.push(t);
      return path.reverse();
    }
    for (const m of moves(map, n, env, tall, spare)) {
      const k = key(m.x, m.y);
      if (parent.has(k)) continue;
      parent.set(k, n);
      queue.push(m);
    }
  }
  return null;
}

/**
 * The moves a body can make from a standing tile, as a bot makes them: the jump graph's, less the arcs whose way down
 * from the apex crosses a floor (the graph only checks the rise and the apex row, a generous superset for the solver):
 * a body coming down lands on the first floor under it, a one-way ledge included.
 */
export function moves(map: Tilemap, n: { x: number; y: number }, env: Envelope, tall: number, spare = 0): Array<{ x: number; y: number }> {
  return jumpNeighbours(map, n, env, tall).filter((m) => {
    // A step along the floor.
    if (m.y === n.y && Math.abs(m.x - n.x) === 1) return true;
    // With tiles to spare: no jump within `spare` tiles of the farthest the envelope carries the body at its height.
    const dy = m.y - n.y;
    const reach = env.maxDx.get(dy) ?? (dy < 0 ? 0 : (env.maxDx.get(env.maxDropTiles) ?? 0));
    if (Math.abs(m.x - n.x) > 1 && Math.abs(m.x - n.x) > reach - spare) return false;
    const apex = Math.max(0, Math.min(n.y, m.y) - 1);
    for (let y = apex + 1; y <= m.y; y++) {
      const k = map.kindAt(m.x, y);
      if (k === 'solid' || k === 'oneway') return false;
    }
    return true;
  });
}

/** Rows the hero's body spans: three at 16 px tiles. */
export function tallTiles(tileSize: number): number {
  return Math.max(1, Math.ceil(PLAYER.h / tileSize));
}

/** BFS distance to the nearest standing tile from which a relic at (x, y) can be touched (at it, or a jump below it). */
export function relicReach(dist: Map<string, number>, x: number, y: number, env: Envelope): number | null {
  let best: number | null = null;
  for (let dy = 0; dy <= env.jumpUpTiles + 1; dy++) {
    const d = dist.get(key(x, y + dy));
    if (d !== undefined && (best === null || d < best)) best = d;
  }
  return best;
}

/** The standing tiles from which the goal is touched (the hero is three tiles tall: the goal tile or the one above it). */
function goalTiles(goal: { x: number; y: number }): string[] {
  return [key(goal.x, goal.y), key(goal.x, goal.y - 1)];
}

/** The room a tile is in, by its place in the list, or -1. */
export function roomOf(rooms: readonly LevelRoom[], x: number, y: number): number {
  return rooms.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

export interface WorldStep {
  type: string;
  x: number;
  y: number;
}

export interface World {
  /** Relics collected, in the order the search reached them. */
  steps: WorldStep[];
  goalReachable: boolean;
  /** The goal is out of reach before any relic: the region actually gates on its abilities. */
  gated: boolean;
  abilities: Abilities;
  unreachableRelics: LevelEntity[];
  /** Standing tiles reached with everything the region gives. */
  reachableTiles: number;
  /**
   * A standing tile the player can get to and never leave toward anything: not back to the spawn, not on to the goal,
   * not to a relic still lying there (null when there is none).
   */
  trap: { x: number; y: number } | null;
  /** Rooms with no standing tile the player ever reaches. */
  unreachableRooms: LevelRoom[];
  /** The longest run of connected rooms with no altar and no spawn in it (the most the player crosses between rests). */
  longestStretch: string[];
  /** Altars the player never reaches (a standing tile beside them). */
  unreachableAltars: LevelEntity[];
}

/**
 * Tiles that cannot get to any of the targets: a reverse search over the moves inside `reach` (which is closed under
 * moves, being everything reachable from the spawn with these abilities).
 */
function trapIn(map: Tilemap, reach: Map<string, number>, env: Envelope, tall: number, targets: readonly string[]): { x: number; y: number } | null {
  const into = new Map<string, string[]>();
  for (const k of reach.keys()) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    for (const m of jumpNeighbours(map, { x, y }, env, tall)) {
      const mk = key(m.x, m.y);
      const list = into.get(mk);
      if (list) list.push(k);
      else into.set(mk, [k]);
    }
  }
  const good = new Set<string>();
  const queue: string[] = [];
  for (const t of targets) {
    if (!reach.has(t) || good.has(t)) continue;
    good.add(t);
    queue.push(t);
  }
  for (let i = 0; i < queue.length; i++) {
    for (const from of into.get(queue[i]!) ?? []) {
      if (good.has(from)) continue;
      good.add(from);
      queue.push(from);
    }
  }
  // The first trap in reading order, so the report names the same tile every time.
  let trap: { x: number; y: number } | null = null;
  for (const k of reach.keys()) {
    if (good.has(k)) continue;
    const [x, y] = k.split(',').map(Number) as [number, number];
    if (!trap || y < trap.y || (y === trap.y && x < trap.x)) trap = { x, y };
  }
  return trap;
}

/** Rooms joined by a move from one into the other, with everything the region gives. */
function roomLinks(map: Tilemap, rooms: readonly LevelRoom[], reach: Map<string, number>, env: Envelope, tall: number): Array<Set<number>> {
  const links = rooms.map(() => new Set<number>());
  for (const k of reach.keys()) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const a = roomOf(rooms, x, y);
    if (a < 0) continue;
    for (const m of jumpNeighbours(map, { x, y }, env, tall)) {
      const b = roomOf(rooms, m.x, m.y);
      if (b < 0 || b === a) continue;
      links[a]!.add(b);
      links[b]!.add(a);
    }
  }
  return links;
}

/**
 * The world solver for a region: from the spawn, reach everything the current abilities allow, take every reachable
 * relic (wings add an air jump, boots the dash), and repeat until nothing changes. At every stage no tile the player can
 * reach may strand them; at the end every room must be reached, and no stretch of rooms between rests may run longer
 * than MAX_STRETCH. A generous superset of what a player can do, like the platformer's solver: the route bot has the
 * final word.
 */
export function world(level: LevelJson, feel: FeelPreset): World {
  const map = new Tilemap(level);
  const ts = level.tileSize;
  const tall = tallTiles(ts);
  const rooms = level.rooms ?? [];
  const abilities: Abilities = { ...NO_ABILITIES };
  const relics = level.entities.filter((e) => RELIC_ABILITY[e.type] !== undefined);
  const taken = new Set<LevelEntity>();
  const steps: WorldStep[] = [];
  const spawn = key(level.spawn.x, level.spawn.y);
  const goal = goalTiles(level.goal);
  let env = envelopeFor(feel, ts, abilities);
  let reach = reachableTiles(map, level.spawn, env, tall);
  const gated = !goal.some((g) => reach.has(g));
  let trap: { x: number; y: number } | null = null;
  for (let guard = 0; guard < 16; guard++) {
    env = envelopeFor(feel, ts, abilities);
    reach = reachableTiles(map, level.spawn, env, tall);
    const lying = relics.filter((r) => !taken.has(r));
    const relicTiles = lying.flatMap((r) => Array.from({ length: env.jumpUpTiles + 2 }, (_, dy) => key(r.x, r.y + dy)));
    trap ??= trapIn(map, reach, env, tall, [spawn, ...goal, ...relicTiles]);
    const found = lying
      .map((r) => ({ r, d: relicReach(reach, r.x, r.y, env) }))
      .filter((c): c is { r: LevelEntity; d: number } => c.d !== null)
      .sort((a, b) => a.d - b.d || a.r.x - b.r.x || a.r.y - b.r.y);
    if (found.length === 0) break;
    for (const { r } of found) {
      taken.add(r);
      const ability = RELIC_ABILITY[r.type];
      if (ability === ABILITY_DOUBLE_JUMP) abilities.doubleJump = true;
      else if (ability === ABILITY_DASH) abilities.dash = true;
      steps.push({ type: r.type, x: r.x, y: r.y });
    }
  }

  const reachedRooms = new Set<number>();
  for (const k of reach.keys()) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const r = roomOf(rooms, x, y);
    if (r >= 0) reachedRooms.add(r);
  }
  // Stretches: the rooms left once those with an altar or the spawn are taken out, in connected runs.
  const links = roomLinks(map, rooms, reach, env, tall);
  const altars = level.entities.filter((e) => e.type === ALTAR_TYPE);
  const rests = new Set<number>([roomOf(rooms, level.spawn.x, level.spawn.y), ...altars.map((a) => roomOf(rooms, a.x, a.y))]);
  let longest: number[] = [];
  const seen = new Set<number>();
  for (let start = 0; start < rooms.length; start++) {
    if (rests.has(start) || seen.has(start) || !reachedRooms.has(start)) continue;
    const run = [start];
    seen.add(start);
    for (let i = 0; i < run.length; i++) {
      for (const n of links[run[i]!]!) {
        if (rests.has(n) || seen.has(n)) continue;
        seen.add(n);
        run.push(n);
      }
    }
    if (run.length > longest.length) longest = run.sort((a, b) => a - b);
  }
  return {
    steps,
    goalReachable: goal.some((g) => reach.has(g)),
    gated,
    abilities,
    unreachableRelics: relics.filter((r) => !taken.has(r)),
    reachableTiles: reach.size,
    trap,
    unreachableRooms: rooms.filter((_, i) => !reachedRooms.has(i)),
    longestStretch: longest.map((i) => rooms[i]!.id),
    unreachableAltars: altars.filter((a) => relicReach(reach, a.x, a.y, env) === null),
  };
}
