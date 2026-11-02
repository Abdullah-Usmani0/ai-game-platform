import type { LevelJson } from '@gg/schemas';
import { Rng, Tilemap, type FeelPreset } from '@gg/sdk';
import { err, jumpEnvelope, reachableTiles, warn, type Issue } from '@gg/validators';
import { beside, chebyshev, floorAt, footprint, key, ring, solidChar, stamp, tallTiles, tileOf, walkable, type Tile } from './stations.js';

/**
 * Where a composed game's people stand: the talk places them (its `people`: who, in which level, near its start, its
 * middle or its end), and the talk block puts each on the level its base genre generated, so the level carries them as
 * data the editor shows, the validator checks and the proofs play with.
 *
 * Side view, a person stands on ground the player can reach, as a prop the player walks in front of. Top-down, a person
 * stands on a tile of their own written solid into the level (the player walks round them, not through them), on open
 * floor with a free ring round it, so they never pinch a path; the goal stays reachable and so does a tile beside them.
 * Either way they keep clear of the spawn, the goal, each other and whatever else the level places, and the seed picks
 * among the spots nearest where along the way the story wants them.
 */
export interface PeopleCtx {
  movementMode: 'platformer' | 'topdown';
  feel: FeelPreset;
  /** The game's name for a person. */
  type: string;
  /** A person's size in pixels (the definition's). */
  size: { w: number; h: number };
  /**
   * The people the story places in this level, each with the look they wear; absent where the level's place in the game
   * or the story is not known (then only where the level's people stand is checked).
   */
  people?: ReadonlyArray<{ speaker: string; near: 'start' | 'middle' | 'end'; look: number }>;
}

/** How far along the way to the goal a person near its start, middle or end stands (start: a few steps from the spawn). */
function target(near: 'start' | 'middle' | 'end', far: number): number {
  return near === 'start' ? Math.min(6, far * 0.25) : near === 'middle' ? far * 0.5 : far * 0.85;
}

/** The spots in order of how near each is to where the story wants the person, then top to bottom, left to right. */
function byNearness(dist: ReadonlyMap<string, number>, goal: Tile, near: 'start' | 'middle' | 'end'): Tile[] {
  const far = dist.get(key(goal)) ?? Math.max(1, ...dist.values());
  const want = target(near, far);
  return [...dist.entries()]
    .map(([k, d]) => ({ t: tileOf(k), d }))
    .sort((a, b) => Math.abs(a.d - want) - Math.abs(b.d - want) || a.t.y - b.t.y || a.t.x - b.t.x)
    .map((c) => c.t);
}

/** Up to four spots that fit, nearest first: the seed picks one, so levels differ and each stays sound. */
function pick(spots: readonly Tile[], fits: (t: Tile) => boolean, rng: Rng): Tile | null {
  const fitting: Tile[] = [];
  for (const t of spots) {
    if (!fits(t)) continue;
    fitting.push(t);
    if (fitting.length === 4) break;
  }
  return fitting.length > 0 ? fitting[rng.int(fitting.length)]! : null;
}

const personOf = (type: string, t: Tile, p: { speaker: string; look: number }) => ({ type, x: t.x, y: t.y, props: { speaker: p.speaker, look: p.look } });

/** Side view: each person on ground the player reaches, clear of the spawn, the goal, the level's things and each other. */
function dressSide(level: LevelJson, seed: number, ctx: PeopleCtx): LevelJson {
  const map = new Tilemap(level);
  const ts = level.tileSize;
  const dist = reachableTiles(map, level.spawn, jumpEnvelope(ctx.feel, ts), tallTiles(ts));
  const rng = new Rng((seed * 7919 + 29) >>> 0);
  const taken: Tile[] = level.entities.map((e) => ({ x: e.x, y: e.y }));
  const placed: ReturnType<typeof personOf>[] = [];
  for (const person of ctx.people ?? []) {
    const fits = (t: Tile) =>
      map.kindAt(t.x, t.y) === 'air' &&
      ['solid', 'oneway'].includes(map.kindAt(t.x, t.y + 1)) &&
      chebyshev(t, level.spawn) >= 3 &&
      chebyshev(t, level.goal) >= 3 &&
      taken.every((o) => chebyshev(o, t) >= 2) &&
      placed.every((o) => chebyshev(o, t) >= 3);
    const t = pick(byNearness(dist, level.goal, person.near), fits, rng);
    if (t) placed.push(personOf(ctx.type, t, person));
  }
  return placed.length > 0 ? { ...level, entities: [...level.entities, ...placed] } : level;
}

/**
 * Top-down: each person on a solid tile of their own with open floor all round it. Floor all round means the tile can
 * close no way through (the ring round it stays one walk), so the goal stays reachable and so does the ring beside them.
 */
function dressTopdown(level: LevelJson, seed: number, ctx: PeopleCtx): LevelJson {
  const ch = solidChar(level);
  if (!ch) return level;
  const ts = level.tileSize;
  const rng = new Rng((seed * 7919 + 31) >>> 0);
  const { spawn, goal } = level;
  let current = level;
  const taken: Tile[] = level.entities.map((e) => ({ x: e.x, y: e.y }));
  const placed: ReturnType<typeof personOf>[] = [];
  for (const person of ctx.people ?? []) {
    const map = new Tilemap(current);
    const reach = walkable(map, spawn);
    const fits = (t: Tile): boolean => {
      const tiles = footprint(t, ctx.size, ts);
      for (const f of tiles) {
        if (!reach.has(key(f)) || chebyshev(f, spawn) < 2 || chebyshev(f, goal) < 2) return false;
        if (taken.some((o) => chebyshev(o, f) < 2) || placed.some((o) => chebyshev(o, f) < 3)) return false;
      }
      return ring(tiles).every((r) => floorAt(map, r));
    };
    const t = pick(byNearness(reach, goal, person.near), fits, rng);
    if (!t) continue;
    current = stamp(current, footprint(t, ctx.size, ts), ch);
    placed.push(personOf(ctx.type, t, person));
  }
  return placed.length > 0 ? { ...current, entities: [...current.entities, ...placed] } : level;
}

/** The level with the people its story places in it: deterministic from the seed, on the level as generated. */
export function dressPeople(level: LevelJson, seed: number, ctx: PeopleCtx): LevelJson {
  if ((ctx.people ?? []).length === 0) return level;
  return ctx.movementMode === 'topdown' ? dressTopdown(level, seed, ctx) : dressSide(level, seed, ctx);
}

/**
 * What a level must hold for its people to be met: everyone its story places in it standing there (a quest-giver who is
 * missing is a quest never begun); side view, each where the player can reach; top-down, each on a solid tile of their
 * own with a reachable tile beside it, the goal still reachable.
 */
export function checkPeople(level: LevelJson, ctx: PeopleCtx): Issue[] {
  const issues: Issue[] = [];
  const persons = level.entities.filter((e) => e.type === ctx.type);
  const speakerOf = (e: (typeof persons)[number]) => (typeof e.props['speaker'] === 'string' ? e.props['speaker'] : null);
  for (const p of ctx.people ?? []) {
    if (!persons.some((e) => speakerOf(e) === p.speaker)) issues.push(err('person_missing', `the story places '${p.speaker}' in this level, and nobody here talks as them`, { path: p.speaker }));
  }
  if (ctx.people) {
    for (const e of persons) {
      const s = speakerOf(e);
      if (s === null || !ctx.people.some((p) => p.speaker === s)) issues.push(warn('person_stray', `the ${e.type} at (${e.x},${e.y}) talks as ${s === null ? 'nobody' : `'${s}'`}, whom the story does not place in this level`, { x: e.x, y: e.y }));
    }
  }
  if (persons.length === 0) return issues;
  const map = new Tilemap(level);
  const ts = level.tileSize;
  if (ctx.movementMode === 'topdown') {
    const reach = walkable(map, level.spawn);
    if (!reach.has(key(level.goal))) issues.push(err('person_blocks', 'the people close the way from the spawn to the goal', { x: level.goal.x, y: level.goal.y }));
    for (const e of persons) {
      const tiles = footprint(e, ctx.size, ts);
      if (tiles.some((t) => map.kindAt(t.x, t.y) !== 'solid')) issues.push(err('person_not_solid', `the ${e.type} at (${e.x},${e.y}) does not stand on a solid tile: the player would walk through them`, { x: e.x, y: e.y }));
      if (!beside(tiles).some((t) => reach.has(key(t)))) issues.push(err('person_unreachable', `the ${e.type} at (${e.x},${e.y}) has no reachable tile beside them`, { x: e.x, y: e.y }));
    }
    return issues;
  }
  const dist = reachableTiles(map, level.spawn, jumpEnvelope(ctx.feel, ts), tallTiles(ts));
  for (const e of persons) if (!dist.has(key(e))) issues.push(err('person_unreachable', `the ${e.type} at (${e.x},${e.y}) does not stand where the player can reach`, { x: e.x, y: e.y }));
  return issues;
}
