import type { LevelJson, LevelRoom } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';
import { ALTAR_TYPE, BOOTS_TYPE, GARGOYLE_TYPE, GHOUL_TYPE, HOUND_TYPE, SOUL_TYPE, WINGS_TYPE } from '../entities.js';

/** One screen of the castle view (480x270 at 16 px tiles): no room is narrower, so the camera never shows two. */
export const SCREEN_TILES = 30;
export const REGION_ROWS = 17;
/** The walking row of the region's ground floor; the ground is the two rows under it. */
export const BASE_WALK = 14;
/**
 * Gate sizes in tiles, held under both castle feels (see the package tests). A plain jump lifts the feet at most 3.6
 * tiles and a double jump at least 4.7, so a 4-tile ledge needs the wings. The wings alone carry the body over at most
 * 8.7 tiles and the double jump with the dash at least 11.5, so a 10-tile chasm needs the boots as well.
 */
export const LEDGE_TILES = 4;
export const CHASM_TILES = 10;
/** The walking row above the ledge. */
export const HIGH_WALK = BASE_WALK - LEDGE_TILES;
/** A doorway between rooms: four rows over the walking row, for a body three tiles tall. */
const DOOR_ROWS = 4;
/** The widest level LevelJson holds. */
export const MAX_REGION_TILES = 400;

type Grid = string[][];

/** What a room's builder draws with: columns are the room's own, rows the region's. */
interface Room {
  readonly w: number;
  readonly d: number;
  readonly rng: Rng;
  /** Ground under the walking row `walk` over columns lx0..lx1, and the air above it up to the ceiling. */
  floor(lx0: number, lx1: number, walk: number): void;
  fill(lx0: number, y0: number, lx1: number, y1: number, ch: string): void;
  put(type: string, lx: number, y: number): void;
  /** A spike trench: the ground taken out under columns lx0..lx1, spikes at the bottom of the region. */
  trench(lx0: number, lx1: number, walk: number): void;
  /** Open floor at (lx, walk): air with room for a body over it, ground under it. */
  open(lx: number, walk: number): boolean;
}

interface RoomPlan {
  id: string;
  kind: LevelRoom['kind'];
  w: number;
  /** Builds the room, entered at walking row `walk`; returns the walking row it leaves at. */
  build(r: Room, walk: number): number;
}

/** A relic on a pedestal two tiles wide and one high, floating a tile over it, in the middle of the room. */
function relicRoom(type: string): RoomPlan {
  return {
    id: `relic-${type}`,
    kind: 'room',
    w: SCREEN_TILES,
    build(r, walk) {
      r.floor(0, r.w - 2, walk);
      const mid = Math.floor(r.w / 2) - 1;
      r.fill(mid, walk, mid + 1, walk, '#');
      r.put(type, mid, walk - 2);
      r.put(SOUL_TYPE, mid - 7, walk - 1);
      r.put(SOUL_TYPE, mid + 8, walk - 1);
      return walk;
    },
  };
}

/** Where the player starts: open floor and nothing that hurts. */
const START: RoomPlan = {
  id: 'start',
  kind: 'room',
  w: SCREEN_TILES,
  build(r, walk) {
    r.floor(0, r.w - 2, walk);
    r.put(SOUL_TYPE, 15, walk - 1);
    r.put(SOUL_TYPE, 19, walk - 1);
    return walk;
  },
};

/** A save room: an altar in the middle and nothing else. */
function altarRoom(n: number): RoomPlan {
  return {
    id: `altar-${n}`,
    kind: 'save',
    w: SCREEN_TILES,
    build(r, walk) {
      r.floor(0, r.w - 2, walk);
      r.put(ALTAR_TYPE, Math.floor(r.w / 2) - 1, walk);
      return walk;
    },
  };
}

/**
 * A hall: the platformer's chunks at the castle's scale between a safe first and last few columns. One-way ledges
 * with souls over them, low walls (one tile, two from the middle difficulties), spike trenches two wide, and enemies:
 * ghouls, hounds from 0.4, gargoyles from 0.6.
 */
function hall(n: number, w: number): RoomPlan {
  return {
    id: `hall-${n}`,
    kind: 'room',
    w,
    build(r, walk) {
      r.floor(0, r.w - 2, walk);
      const d = r.d;
      let enemies = 0;
      const budget = 1 + Math.round(d * 2);
      let x = 4;
      while (x < r.w - 8) {
        const roll = r.rng.float();
        if (roll < 0.22 && d >= 0.2) {
          r.trench(x, x + 1, walk);
          x += 2 + 5;
        } else if (roll < 0.45) {
          const len = 4 + r.rng.int(3);
          r.fill(x, walk - 3, x + len - 1, walk - 3, '-');
          r.put(SOUL_TYPE, x + Math.floor(len / 2), walk - 5);
          x += len + 3;
        } else if (roll < 0.6) {
          const h = d < 0.3 ? 1 : 2;
          r.fill(x, walk - h + 1, x + 1, walk, '#');
          x += 2 + 5;
        } else if (enemies < budget && d >= 0.15) {
          const type = d >= 0.6 && r.rng.chance(0.3) ? GARGOYLE_TYPE : d >= 0.4 && r.rng.chance(0.4) ? HOUND_TYPE : GHOUL_TYPE;
          r.put(type, x + 2, walk);
          enemies++;
          x += 7;
        } else {
          r.put(SOUL_TYPE, x + 1, walk - 1);
          x += 4;
        }
      }
      // Every hall past the first gate has a guard, on the last open floor before the far doorway.
      if (enemies === 0 && d >= 0.15) {
        let lx = r.w - 6;
        while (lx > 4 && !r.open(lx, walk)) lx--;
        r.put(GHOUL_TYPE, lx, walk);
      }
      return walk;
    },
  };
}

/** The wings gate: the floor steps up LEDGE_TILES at the middle of the room, a wall no plain jump tops. */
const LEDGE: RoomPlan = {
  id: 'ledge',
  kind: 'room',
  w: SCREEN_TILES,
  build(r, walk) {
    const face = 15;
    const high = walk - LEDGE_TILES;
    r.floor(0, face - 1, walk);
    r.floor(face, r.w - 2, high);
    r.put(SOUL_TYPE, face + 1, high - 1);
    if (r.d >= 0.3) r.put(GHOUL_TYPE, face + 8, high);
    return high;
  },
};

/** Back down to the ground floor: a drop LEDGE_TILES deep, which the wings climb again. */
const DESCENT: RoomPlan = {
  id: 'descent',
  kind: 'room',
  w: SCREEN_TILES,
  build(r, walk) {
    const edge = 12;
    const low = walk + LEDGE_TILES;
    r.floor(0, edge, walk);
    r.floor(edge + 1, r.w - 2, low);
    if (r.d >= 0.5) r.put(HOUND_TYPE, edge + 9, low);
    return low;
  },
};

/** The boots gate: a spike chasm CHASM_TILES wide across the middle, souls along the arc over it. */
const CHASM: RoomPlan = {
  id: 'chasm',
  kind: 'room',
  w: SCREEN_TILES,
  build(r, walk) {
    const from = Math.floor((r.w - 1 - CHASM_TILES) / 2);
    r.floor(0, r.w - 2, walk);
    r.trench(from, from + CHASM_TILES - 1, walk);
    for (const k of [2, 5, 8]) r.put(SOUL_TYPE, from + k, walk - 5);
    return walk;
  },
};

/** The way out: the goal by the far wall, a gargoyle on guard from the middle difficulties. */
const EXIT: RoomPlan = {
  id: 'exit',
  kind: 'exit',
  w: SCREEN_TILES,
  build(r, walk) {
    r.floor(0, r.w - 2, walk);
    r.fill(r.w - 5, walk, r.w - 5, walk, 'G');
    if (r.d >= 0.5) r.put(GARGOYLE_TYPE, 12, walk);
    return walk;
  },
};

/**
 * The region's rooms in order, left to right: the wings lie behind the start (the player goes back for them), a hall
 * leads to an altar and the ledge only the wings climb; from 0.2 the boots wait past one hall (two from 0.4) with an
 * altar after them, then a descent, the chasm only the boots cross, a hall and the way out. No stretch between rests runs
 * past four rooms, and the region stays within MAX_REGION_TILES.
 */
function mission(d: number): RoomPlan[] {
  let n = 0;
  const halls = (count: number) => Array.from({ length: count }, () => hall(++n, SCREEN_TILES));
  const plans = [relicRoom(WINGS_TYPE), START, ...halls(1), altarRoom(1), LEDGE, ...halls(d >= 0.4 ? 2 : 1)];
  if (d >= 0.2) plans.push(relicRoom(BOOTS_TYPE), altarRoom(2), DESCENT, CHASM, ...halls(1));
  plans.push(EXIT);
  return plans;
}

/**
 * Seeded castle region: one level of rooms a screen wide or more, 17 rows tall, side by side with doorways between
 * them. Difficulty adds the second gate (from 0.2), halls, trenches, taller walls and enemies.
 */
export function generateRegion(params: LevelGenParams): LevelJson {
  const rng = new Rng(params.seed);
  const d = Math.max(0, Math.min(1, params.difficulty));
  const plans = mission(d);
  const width = plans.reduce((n, p) => n + p.w, 0);
  const grid: Grid = Array.from({ length: REGION_ROWS }, () => Array<string>(width).fill('#'));
  const set = (x: number, y: number, ch: string) => {
    if (x >= 0 && x < width && y >= 0 && y < REGION_ROWS) grid[y]![x] = ch;
  };
  const entities: LevelJson['entities'] = [];
  const rooms: LevelRoom[] = [];
  let x0 = 0;
  let walk = BASE_WALK;
  let spawn = { x: 0, y: 0 };
  let goal = { x: 0, y: 0 };
  for (const [i, plan] of plans.entries()) {
    // The first room's first column is the region's left wall; every room's last column is its right wall.
    const first = i === 0 ? 1 : 0;
    const room: Room = {
      w: plan.w,
      d,
      rng,
      floor(lx0, lx1, row) {
        for (let lx = Math.max(first, lx0); lx <= Math.min(plan.w - 2, lx1); lx++) {
          for (let y = 1; y < REGION_ROWS; y++) set(x0 + lx, y, y <= row ? '.' : '#');
        }
      },
      fill(lx0, y0, lx1, y1, ch) {
        for (let y = y0; y <= y1; y++) for (let lx = lx0; lx <= lx1; lx++) set(x0 + lx, y, ch);
      },
      put(type, lx, y) {
        entities.push({ type, x: x0 + lx, y, props: {} });
      },
      trench(lx0, lx1, row) {
        for (let lx = lx0; lx <= lx1; lx++) {
          for (let y = row + 1; y < REGION_ROWS - 1; y++) set(x0 + lx, y, '.');
          set(x0 + lx, REGION_ROWS - 1, '^');
        }
      },
      open(lx, row) {
        const at = (y: number) => grid[y]?.[x0 + lx];
        return at(row) === '.' && at(row - 1) === '.' && at(row - 2) === '.' && at(row + 1) === '#';
      },
    };
    const entry = walk;
    walk = plan.build(room, entry);
    if (plan === START) spawn = { x: x0 + 8, y: entry };
    if (plan === EXIT) goal = { x: x0 + plan.w - 5, y: walk };
    if (i < plans.length - 1) for (let y = walk - DOOR_ROWS + 1; y <= walk; y++) set(x0 + plan.w - 1, y, '.');
    rooms.push({ id: plan.id, x: x0, y: 0, w: plan.w, h: REGION_ROWS, kind: plan.kind });
    x0 += plan.w;
  }
  set(spawn.x, spawn.y, 'S');
  return {
    version: 1,
    id: `region-${params.seed}`,
    name: `Region ${params.seed}`,
    tileSize: 16,
    width,
    height: REGION_ROWS,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal', S: 'spawn' },
    rows: grid.map((r) => r.join('')),
    entities,
    rooms,
    spawn,
    goal,
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}
