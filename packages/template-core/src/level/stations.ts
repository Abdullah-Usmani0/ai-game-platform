import type { LevelJson } from '@gg/schemas';
import { Rng, Tilemap, type FeelPreset } from '@gg/sdk';
import { err, jumpEnvelope, reachableTiles, type Issue } from '@gg/validators';

/**
 * Where a courier's job happens in a level: a source (where cargo is made) and dropoffs (where it goes). The block that
 * needs them places them on the level its base genre generates, so the level carries them as data: the editor shows
 * them, the validator checks them, and the proof plays them.
 *
 * Top-down, a station stands on solid ground written into the level (as a farm's bin and stall do), on open floor with
 * a free ring around it and space between stations, so it never pinches a path; every station keeps a reachable tile
 * beside it and the goal stays reachable. Everything stands within a service window round the spawn, so the whole
 * job is on screen.
 *
 * Side view, stations are props the player walks in front of: each on a ledge two tiles wide on the reachable path,
 * the source near the start and the dropoffs further on, each reachable from the source and back by the feel's jumps.
 */
export interface StationsCtx {
  movementMode: 'platformer' | 'topdown';
  feel: FeelPreset;
  /** The game's names for the source and the dropoff. */
  types: { source: string; dropoff: string };
  /** Their sizes in pixels (the definitions'). */
  sizes: { source: { w: number; h: number }; dropoff: { w: number; h: number } };
  /** How many dropoffs a level has. */
  dropoffs: number;
}

/** The service window: how many tiles from the spawn a station may stand, across and up or down (top-down). */
export const SERVICE_WINDOW = { dx: 10, dy: 5 } as const;
/** Side view: how far past the source a dropoff may stand, in tiles (a trip there and back stays short). */
export const SIDE_REACH = { min: 8, max: 40 } as const;

export interface Tile {
  x: number;
  y: number;
}

export const key = (t: Tile) => `${t.x},${t.y}`;
export const tileOf = (k: string): Tile => {
  const [x, y] = k.split(',').map(Number) as [number, number];
  return { x, y };
};
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A station's tiles: its anchor is its bottom-left tile (where a level places an entity), and it stands up from there. */
export function footprint(anchor: Tile, size: { w: number; h: number }, ts: number): Tile[] {
  const fw = Math.max(1, Math.ceil(size.w / ts));
  const fh = Math.max(1, Math.ceil(size.h / ts));
  const out: Tile[] = [];
  for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) out.push({ x: anchor.x + dx, y: anchor.y - dy });
  return out;
}

/** Floor a top-down player can walk: inside the level, neither solid nor a hazard. */
export function floorAt(map: Tilemap, t: Tile): boolean {
  if (t.x < 0 || t.y < 0 || t.x >= map.width || t.y >= map.height) return false;
  const k = map.kindAt(t.x, t.y);
  return k !== 'solid' && k !== 'hazard';
}

/** The floor tiles reachable from a tile by walking (four neighbours), with their distances. */
export function walkable(map: Tilemap, from: Tile): Map<string, number> {
  const dist = new Map<string, number>([[key(from), 0]]);
  const queue: Tile[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]!;
    const d = dist.get(key(t))!;
    for (const [dx, dy] of NEIGHBOURS) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (dist.has(key(n)) || !floorAt(map, n)) continue;
      dist.set(key(n), d + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** The tiles beside a footprint (four neighbours of its tiles, outside it). */
export function beside(tiles: readonly Tile[]): Tile[] {
  const inside = new Set(tiles.map(key));
  const out = new Map<string, Tile>();
  for (const t of tiles) {
    for (const [dx, dy] of NEIGHBOURS) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (!inside.has(key(n))) out.set(key(n), n);
    }
  }
  return [...out.values()];
}

/** The tiles round a footprint, one tile out, corners included. */
export function ring(tiles: readonly Tile[]): Tile[] {
  const inside = new Set(tiles.map(key));
  const out = new Map<string, Tile>();
  for (const t of tiles) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = { x: t.x + dx, y: t.y + dy };
        if (!inside.has(key(n))) out.set(key(n), n);
      }
    }
  }
  return [...out.values()];
}

export const solidChar = (level: LevelJson): string | null => Object.entries(level.legend).find(([, k]) => k === 'solid')?.[0] ?? null;

/** The level with these tiles made solid. */
export function stamp(level: LevelJson, tiles: readonly Tile[], ch: string): LevelJson {
  const rows = level.rows.map((r) => [...r]);
  for (const t of tiles) if (rows[t.y]?.[t.x] !== undefined) rows[t.y]![t.x] = ch;
  return { ...level, rows: rows.map((r) => r.join('')) };
}

export const chebyshev = (a: Tile, b: Tile) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Candidates by how far each is from the nearest of some tiles, farthest first (ties keep the given order). */
function farthestFirst(candidates: readonly Tile[], from: readonly Tile[]): Tile[] {
  const score = (c: Tile) => Math.min(...from.map((o) => Math.hypot(o.x - c.x, o.y - c.y)));
  return candidates.map((c, i) => ({ c, i, s: score(c) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
}

/** Top-down: stations on solid ground in the service window, each with a free ring and a reachable tile beside it. */
function dressTopdown(level: LevelJson, seed: number, ctx: StationsCtx): LevelJson {
  const ch = solidChar(level);
  if (!ch) return level;
  const ts = level.tileSize;
  const rng = new Rng((seed * 7919 + 11) >>> 0);
  const { spawn, goal } = level;
  let current = level;
  const placed: Array<{ type: string; anchor: Tile; tiles: Tile[] }> = [];
  // Where a station can stand on the level as it is now: on reachable floor in the window, clear of the spawn, the
  // goal and the other stations, with a free ring round it; and once it stands, the spawn still reaches the goal and a
  // tile beside every station. The cheap checks come first.
  const fits = (anchor: Tile, size: { w: number; h: number }, map: Tilemap, reach: ReadonlyMap<string, number>): boolean => {
    const tiles = footprint(anchor, size, ts);
    for (const t of tiles) {
      if (!reach.has(key(t)) || chebyshev(t, spawn) < 2 || chebyshev(t, goal) < 2) return false;
      if (Math.abs(t.x - spawn.x) > SERVICE_WINDOW.dx || Math.abs(t.y - spawn.y) > SERVICE_WINDOW.dy) return false;
      if (placed.some((p) => p.tiles.some((q) => chebyshev(q, t) < 3))) return false;
    }
    if (ring(tiles).some((t) => !floorAt(map, t))) return false;
    const still = walkable(new Tilemap(stamp(current, tiles, ch)), spawn);
    if (!still.has(key(goal))) return false;
    return [...placed.map((p) => p.tiles), tiles].every((s) => beside(s).some((t) => still.has(key(t))));
  };
  const place = (type: string, anchor: Tile, size: { w: number; h: number }) => {
    const tiles = footprint(anchor, size, ts);
    current = stamp(current, tiles, ch);
    placed.push({ type, anchor, tiles });
  };
  // The source a few steps from the spawn, so the first trip is short; which one is the seed's choice.
  let map = new Tilemap(current);
  let reach = walkable(map, spawn);
  const near = [...reach.entries()].filter(([, d]) => d >= 3 && d <= 6).map(([k]) => tileOf(k)).sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = near.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [near[i], near[j]] = [near[j]!, near[i]!];
  }
  const source = near.find((t) => fits(t, ctx.sizes.source, map, reach));
  if (!source) return level;
  place(ctx.types.source, source, ctx.sizes.source);
  // Then the dropoffs, each as far as it can stand from the stations already placed.
  for (let n = 0; n < ctx.dropoffs; n++) {
    map = new Tilemap(current);
    reach = walkable(map, spawn);
    const open = [...reach.keys()].map(tileOf).sort((a, b) => a.y - b.y || a.x - b.x);
    const d = farthestFirst(open, placed.map((p) => p.anchor)).find((t) => fits(t, ctx.sizes.dropoff, map, reach));
    if (!d) break;
    place(ctx.types.dropoff, d, ctx.sizes.dropoff);
  }
  return { ...current, entities: [...current.entities, ...placed.map((p) => ({ type: p.type, x: p.anchor.x, y: p.anchor.y, props: {} }))] };
}

export const tallTiles = (ts: number) => Math.max(1, Math.ceil(11 / ts));

/** Side view: the player walks in front of stations; each on a two-tile ledge, reachable from the source and back. */
function dressSide(level: LevelJson, seed: number, ctx: StationsCtx): LevelJson {
  const map = new Tilemap(level);
  const ts = level.tileSize;
  const env = jumpEnvelope(ctx.feel, ts);
  const tall = tallTiles(ts);
  const rng = new Rng((seed * 7919 + 17) >>> 0);
  const fromSpawn = reachableTiles(map, level.spawn, env, tall);
  // A ledge two tiles wide the player stands on, with room overhead for a station two tiles tall.
  const ledge = (t: Tile) => fromSpawn.has(key({ x: t.x + 1, y: t.y })) && map.kindAt(t.x, t.y - 1) !== 'solid' && map.kindAt(t.x + 1, t.y - 1) !== 'solid' && map.kindAt(t.x, t.y) !== 'hazard';
  const spots = [...fromSpawn.keys()].map(tileOf).filter(ledge).sort((a, b) => a.x - b.x || a.y - b.y);
  const starts = spots.filter((t) => t.x >= level.spawn.x + 2 && t.x <= level.spawn.x + 8 && Math.abs(t.y - level.spawn.y) <= 2);
  const source = starts.length > 0 ? starts[rng.int(starts.length)]! : spots.find((t) => t.x > level.spawn.x + 1);
  if (!source) return level;
  const fromSource = reachableTiles(map, source, env, tall);
  const back = new Map<string, boolean>();
  const returns = (t: Tile) => {
    const k = key(t);
    if (!back.has(k)) back.set(k, reachableTiles(map, t, env, tall).has(key(source)));
    return back.get(k)!;
  };
  const far = spots.filter((t) => t.x - source.x >= SIDE_REACH.min && t.x - source.x <= SIDE_REACH.max && fromSource.has(key(t)));
  const drops: Tile[] = [];
  for (let n = 0; n < ctx.dropoffs; n++) {
    const d = farthestFirst(far, [source, ...drops]).find((t) => !drops.some((p) => Math.abs(p.x - t.x) < 4) && returns(t));
    if (!d) break;
    drops.push(d);
  }
  if (drops.length === 0) return level;
  return { ...level, entities: [...level.entities, { type: ctx.types.source, x: source.x, y: source.y, props: {} }, ...drops.map((d) => ({ type: ctx.types.dropoff, x: d.x, y: d.y, props: {} }))] };
}

/** The level with its stations placed: deterministic from the seed, on the level as its base genre generated it. */
export function dressStations(level: LevelJson, seed: number, ctx: StationsCtx): LevelJson {
  return ctx.movementMode === 'topdown' ? dressTopdown(level, seed, ctx) : dressSide(level, seed, ctx);
}

/**
 * What a level must hold for its stations to work: a source and a dropoff at least; top-down, each standing on solid
 * ground with a reachable tile beside it while the goal stays reachable; side view, each on the reachable path, every
 * dropoff reachable from the source and back.
 */
export function checkStations(level: LevelJson, ctx: StationsCtx): Issue[] {
  const issues: Issue[] = [];
  const sources = level.entities.filter((e) => e.type === ctx.types.source);
  const drops = level.entities.filter((e) => e.type === ctx.types.dropoff);
  if (sources.length === 0) issues.push(err('stations_missing', `the level has no ${ctx.types.source} to fetch from`));
  if (drops.length === 0) issues.push(err('stations_missing', `the level has no ${ctx.types.dropoff} to deliver to`));
  if (issues.length) return issues;
  const map = new Tilemap(level);
  const ts = level.tileSize;
  if (ctx.movementMode === 'topdown') {
    const reach = walkable(map, level.spawn);
    if (!reach.has(key(level.goal))) issues.push(err('station_blocks', 'the stations close the way from the spawn to the goal', { x: level.goal.x, y: level.goal.y }));
    for (const e of [...sources, ...drops]) {
      const tiles = footprint(e, e.type === ctx.types.source ? ctx.sizes.source : ctx.sizes.dropoff, ts);
      if (tiles.some((t) => map.kindAt(t.x, t.y) !== 'solid')) issues.push(err('station_not_solid', `${e.type} at (${e.x},${e.y}) does not stand on solid ground: the player would walk through it`, { x: e.x, y: e.y }));
      if (!beside(tiles).some((t) => reach.has(key(t)))) issues.push(err('station_unreachable', `${e.type} at (${e.x},${e.y}) has no reachable tile beside it`, { x: e.x, y: e.y }));
    }
    return issues;
  }
  const env = jumpEnvelope(ctx.feel, ts);
  const tall = tallTiles(ts);
  const fromSpawn = reachableTiles(map, level.spawn, env, tall);
  for (const e of [...sources, ...drops]) if (!fromSpawn.has(key(e))) issues.push(err('station_unreachable', `${e.type} at (${e.x},${e.y}) is not on a ledge the player can reach`, { x: e.x, y: e.y }));
  if (issues.length) return issues;
  const source = sources[0]!;
  const fromSource = reachableTiles(map, source, env, tall);
  for (const d of drops) {
    if (!fromSource.has(key(d))) issues.push(err('station_unreachable', `${d.type} at (${d.x},${d.y}) cannot be reached from the ${source.type}`, { x: d.x, y: d.y }));
    else if (!reachableTiles(map, d, env, tall).has(key(source))) issues.push(err('station_one_way', `from ${d.type} at (${d.x},${d.y}) there is no way back to the ${source.type}`, { x: d.x, y: d.y }));
  }
  return issues;
}
