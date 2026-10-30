import type { LevelJson } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';

/** A farm is one screen: 40 x 20 tiles of 8 px under the HUD. */
export const FARM_W = 40;
export const FARM_H = 20;

type Grid = string[][];
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const key = (x: number, y: number) => `${x},${y}`;
const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });

/** The plots a season's field holds at a difficulty: 8 at the easiest, 30 at the hardest. */
export function fieldPlots(difficulty: number): number {
  return Math.round(8 + 22 * Math.max(0, Math.min(1, difficulty)));
}

/** A field of about n plots: whole rows, about twice as wide as it is deep. */
export function fieldShape(n: number): { w: number; h: number } {
  let best = { w: Math.max(3, n), h: 1 };
  let score = Infinity;
  for (let h = 2; h <= 5; h++) {
    for (let w = 3; w <= 12; w++) {
      const s = 3 * Math.abs(w * h - n) + Math.abs(w - 2 * h);
      if (s < score) {
        score = s;
        best = { w, h };
      }
    }
  }
  return best;
}

/** Breadth-first reach over the tiles a player can walk (4-neighbour). */
export function walkable(grid: Grid, from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([key(from.x, from.y)]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (grid[y]?.[x] !== '.' || seen.has(key(x, y))) continue;
      seen.add(key(x, y));
      queue.push({ x, y });
    }
  }
  return seen;
}

/**
 * Whether a walkable tile is a squeeze: walls on both sides of it, left and right or above and below. A player is
 * nearly a tile wide, so a gap of one tile is fiddly to walk through; the farm never leaves one.
 */
export function pinched(grid: Grid, x: number, y: number): boolean {
  if (grid[y]?.[x] !== '.') return false;
  const solid = (tx: number, ty: number) => (grid[ty]?.[tx] ?? '#') === '#';
  return (solid(x - 1, y) && solid(x + 1, y)) || (solid(x, y - 1) && solid(x, y + 1));
}

/**
 * Farm grammar: one season on a fenced farm of 40 x 20 tiles. The farmhouse stands at the top left, its door (the bed)
 * facing the yard; the player wakes on the door step each morning. The shipping bin stands against the house and the
 * seed stall against the east fence. The field of soil plots lies in the open middle, bigger at higher difficulty (8
 * plots to 30) and from 0.55 split in two, for longer walks between the beds. Trees and bushes dress the farm and never
 * close a path or leave a one-tile squeeze: each is placed only if every plot, the bin, the stall and the door can still
 * be reached from the door step. Everything is a plain tilemap with entities on it, so the systems and the bots stay
 * generic.
 */
export function generateFarm(params: LevelGenParams): LevelJson {
  const rng = new Rng(params.seed);
  const d = Math.max(0, Math.min(1, params.difficulty));
  const grid: Grid = Array.from({ length: FARM_H }, (_, y) => Array.from({ length: FARM_W }, (_, x) => (x === 0 || y === 0 || x === FARM_W - 1 || y === FARM_H - 1 ? '#' : '.')));
  const fill = (r: Rect) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y]![x] = '#';
  };
  const entities: LevelJson['entities'] = [];

  // The farmhouse: against the west fence or two tiles clear of it, never one.
  const hx = [1, 3, 4][rng.int(3)]!;
  const house: Rect = { x: hx, y: 1, w: 6, h: 3 };
  fill(house);
  entities.push({ type: 'house', x: hx, y: 3, props: {} });
  const doorX = hx + 2 + rng.int(2);
  entities.push({ type: 'bed', x: doorX, y: 3, props: {} });
  const spawn = { x: doorX, y: 4 };
  // The shipping bin, against the house's east wall.
  const bin = { x: hx + 6, y: 3 };
  grid[bin.y]![bin.x] = '#';
  entities.push({ type: 'bin', x: bin.x, y: bin.y, props: {} });
  // The seed stall: two by two against the east fence (its anchor is its bottom-left tile).
  const sy = 6 + rng.int(9);
  const stall: Rect = { x: FARM_W - 3, y: sy - 1, w: 2, h: 2 };
  fill(stall);
  entities.push({ type: 'shop', x: stall.x, y: sy, props: {} });

  // Kept clear: the yard before the house and the bin, the stall's front, and each field with a walk around it.
  const yard: Rect = { x: 1, y: 1, w: bin.x + 2, h: 5 };
  const stallFront = grow(stall, 2);
  const keep: Rect[] = [yard, stallFront];

  // The field, or two at higher difficulty, placed where its walk around fits the open middle.
  const plots = fieldPlots(d);
  const parts = d >= 0.55 ? [Math.ceil(plots / 2), Math.floor(plots / 2)] : [plots];
  const fields: Rect[] = [];
  for (const n of parts) {
    const { w, h } = fieldShape(n);
    const fits = (r: Rect) => keep.every((k) => !meets(grow(r, 1), k));
    // An easy season keeps the field near the house; a harder one may put it anywhere.
    const near = d < 0.5 ? 6 : 1;
    const walk = (r: Rect) => Math.max(0, r.x - spawn.x, spawn.x - (r.x + r.w - 1)) + (r.y - spawn.y);
    let placed: Rect | null = null;
    for (let tries = 0, found = 0; tries < 80 && found < near; tries++) {
      const r = { x: 2 + rng.int(FARM_W - 4 - w), y: 6 + rng.int(FARM_H - 7 - h), w, h };
      if (!fits(r)) continue;
      found++;
      if (!placed || walk(r) < walk(placed)) placed = r;
    }
    // Out of luck: the first open spot, row by row (the middle of the farm always holds both fields).
    for (let y = 6; y + h <= FARM_H - 2 && !placed; y++) for (let x = 2; x + w <= FARM_W - 2 && !placed; x++) if (fits({ x, y, w, h })) placed = { x, y, w, h };
    if (!placed) throw new Error(`no room for a field of ${w} x ${h}`);
    fields.push(placed);
    keep.push(grow(placed, 1));
    for (let y = placed.y; y < placed.y + h; y++) for (let x = placed.x; x < placed.x + w; x++) entities.push({ type: 'plot', x, y, props: {} });
  }

  // Everything that must stay in reach of the door step: the plots, and a tile beside the bin, the door and the stall.
  const targets: Array<{ x: number; y: number }> = [...fields.flatMap((f) => Array.from({ length: f.w * f.h }, (_, i) => ({ x: f.x + (i % f.w), y: f.y + Math.floor(i / f.w) }))), { x: bin.x, y: bin.y + 1 }, spawn, { x: stall.x - 1, y: sy }];
  const reachable = () => {
    const seen = walkable(grid, spawn);
    return targets.every((t) => seen.has(key(t.x, t.y)));
  };
  /** Solid decor on a free spot, kept only if it squeezes no gap and closes no path. */
  const tryDecor = (r: Rect, type: string): boolean => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (grid[y]?.[x] !== '.') return false;
    if (keep.some((k) => meets(r, k))) return false;
    fill(r);
    let ok = true;
    for (let y = r.y - 1; y <= r.y + r.h && ok; y++) for (let x = r.x - 1; x <= r.x + r.w && ok; x++) if (pinched(grid, x, y)) ok = false;
    if (ok && !reachable()) ok = false;
    if (!ok) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y]![x] = '.';
      return false;
    }
    entities.push({ type, x: r.x, y: r.y + r.h - 1, props: {} });
    return true;
  };
  // Trees, two by two, mostly against the fences (west, east, south, and north beyond the yard); bushes anywhere open.
  const trees = 5 + rng.int(4);
  for (let n = 0, tries = 0; n < trees && tries < 80; tries++) {
    const side = rng.chance(0.7) ? rng.int(4) : -1;
    const x = side === 0 ? 1 : side === 1 ? FARM_W - 3 : side === 3 ? yard.x + yard.w + rng.int(FARM_W - 3 - yard.x - yard.w) : 1 + rng.int(FARM_W - 3);
    const y = side === 2 ? FARM_H - 3 : side === 3 ? 1 : 6 + rng.int(FARM_H - 8);
    if (tryDecor({ x, y, w: 2, h: 2 }, 'tree')) n++;
  }
  // Bushes grow against something, a fence, a tree or the house, so they gather in clumps rather than dot the grass.
  const bushes = 3 + rng.int(4);
  const against = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy!]?.[x + dx!] === '#');
  for (let n = 0, tries = 0; n < bushes && tries < 120; tries++) {
    const x = 1 + rng.int(FARM_W - 2);
    const y = 1 + rng.int(FARM_H - 2);
    if (against(x, y) && tryDecor({ x, y, w: 1, h: 1 }, 'bush')) n++;
  }

  return {
    version: 1,
    id: `farm-${params.seed}`,
    name: `Farm ${params.seed}`,
    tileSize: 8,
    width: FARM_W,
    height: FARM_H,
    legend: { '.': 'air', '#': 'solid' },
    rows: grid.map((row) => row.join('')),
    entities,
    spawn,
    // A farm has no exit: the season is won by the purse. The goal marks the door step.
    goal: { ...spawn },
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}

