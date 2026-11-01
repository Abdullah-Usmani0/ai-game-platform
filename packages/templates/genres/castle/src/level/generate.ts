import type { LevelJson, LevelRoom } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';
import { ALTAR_TYPE, ARCHER_TYPE, BOOTS_TYPE, ENTITY_DEFS, GARGOYLE_TYPE, GATE_TYPE, GHOUL_TYPE, HEADSMAN_TYPE, HOUND_TYPE, KEEPER_TYPE, HERMIT_TYPE, PLAYER, SENTINEL_TYPE, SOUL_TYPE, WINGS_TYPE, WRAITH_TYPE } from '../entities.js';

/** One screen of the castle view (480x270 at 16 px tiles): no room is narrower, so the camera never shows two. */
export const SCREEN_TILES = 30;
/** One screen's rows: a room's height, and a row of rooms in the region. */
export const REGION_ROWS = 17;
/** The walking row of a room's ground floor (in the room's own rows); the ground is the two rows under it. */
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
/** The shaft from the top row of rooms down to the bottom one: this many columns, at the far end of the room above. */
export const SHAFT_TILES = 6;
/** One-way ledges up the shaft, this many rows apart (the weighty feel's plain jump climbs them), on alternate sides. */
const SHAFT_STEP = 2;
/** The shortcut's shaft and its gate: as wide as the gate, at this column of the first altar's room (clear of the altar). */
const GATE_TILES = Math.round((ENTITY_DEFS.find((d) => d.type === GATE_TYPE)?.w ?? 64) / 16);
const SHORTCUT_COLUMN = 20;

type Grid = string[][];

/**
 * What a room's builder draws with, in the room's own frame: the player comes in at column 0 and leaves past column
 * w-1 (a room on the way back is drawn mirrored), rows count from the room's top.
 */
interface Room {
  readonly w: number;
  readonly d: number;
  readonly rng: Rng;
  /** Ground under the walking row `walk` over columns lx0..lx1, and the air above it up to the ceiling. */
  floor(lx0: number, lx1: number, walk: number): void;
  fill(lx0: number, y0: number, lx1: number, y1: number, ch: string): void;
  put(type: string, lx: number, y: number, props?: Record<string, string | number | boolean>): void;
  /** A spike trench: the ground taken out under columns lx0..lx1, spikes at the bottom of the room. */
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
    // A hermit kneels between the spawn and the way back to the wings: the first thing to ask.
    r.put(HERMIT_TYPE, 4, walk);
    r.put(SOUL_TYPE, 15, walk - 1);
    r.put(SOUL_TYPE, 19, walk - 1);
    return walk;
  },
};

/** A save room: an altar in the middle, and in the second a candle-keeper well clear of it (up rests at one, talks to the other). */
function altarRoom(n: number): RoomPlan {
  return {
    id: `altar-${n}`,
    kind: 'save',
    w: SCREEN_TILES,
    build(r, walk) {
      r.floor(0, r.w - 2, walk);
      r.put(ALTAR_TYPE, Math.floor(r.w / 2) - 1, walk);
      if (n === 2) r.put(KEEPER_TYPE, 5, walk);
      return walk;
    },
  };
}

/**
 * A hall: the platformer's chunks at the castle's scale between a safe first and last few columns. One-way ledges
 * with souls over them, low walls (one tile, two from the middle difficulties), spike trenches two wide, and enemies:
 * ghouls, bone archers from 0.3, hounds from 0.4, wraiths from 0.45 (floating a tile over the floor), a sentinel from 0.5
 * (one a hall: it holds the hall behind its shield), gargoyles from 0.6.
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
      let sentinel = false;
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
          const type: string =
            d >= 0.5 && !sentinel && r.rng.chance(0.3)
              ? SENTINEL_TYPE
              : d >= 0.6 && r.rng.chance(0.3)
                ? GARGOYLE_TYPE
                : d >= 0.45 && r.rng.chance(0.25)
                  ? WRAITH_TYPE
                  : d >= 0.4 && r.rng.chance(0.4)
                    ? HOUND_TYPE
                    : d >= 0.3 && r.rng.chance(0.3)
                      ? ARCHER_TYPE
                      : GHOUL_TYPE;
          r.put(type, x + 2, type === WRAITH_TYPE ? walk - 1 : walk);
          enemies++;
          sentinel ||= type === SENTINEL_TYPE;
          x += type === SENTINEL_TYPE ? 9 : 7;
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

/** The boss's room before the way out: open floor, the headsman kneeling over its cleaver two thirds of the way across. */
const BOSS: RoomPlan = {
  id: 'boss',
  kind: 'boss',
  w: SCREEN_TILES,
  build(r, walk) {
    r.floor(0, r.w - 2, walk);
    r.put(HEADSMAN_TYPE, 19, walk, { name: 'The Headsman' });
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

/** Where the mission puts a room: the row of rooms (0 the top) and its column of screens, and which way it is crossed. */
interface Placed {
  plan: RoomPlan;
  row: number;
  col: number;
  /** Crossed right to left (the row back): drawn mirrored. */
  back: boolean;
}

/**
 * The region's rooms in order, laid out on a grid of screens. Along the top row, left to right: the wings behind the
 * start (the player goes back for them), a hall, an altar, the ledge only the wings climb, one or two halls and the
 * boots. From 0.2 the way turns down a shaft at the far end into the second altar's room, then runs back left along the
 * row below: a hall from 0.4, the chasm only the boots cross, the boss's room and the way out, which ends under the
 * first altar. Below 0.2 the boots room is the way out's neighbour on one row, and there is no boss. No stretch between
 * rests runs past four rooms.
 */
function mission(d: number): Placed[] {
  let n = 0;
  const halls = (count: number) => Array.from({ length: count }, () => hall(++n, SCREEN_TILES));
  const top = [relicRoom(WINGS_TYPE), START, ...halls(1), altarRoom(1), LEDGE, ...halls(d >= 0.4 ? 2 : 1)];
  if (d < 0.2) return [...top, EXIT].map((plan, col) => ({ plan, row: 0, col, back: false }));
  top.push(relicRoom(BOOTS_TYPE));
  const bottom = [altarRoom(2), ...halls(d >= 0.4 ? 1 : 0), CHASM, BOSS, EXIT];
  const turn = top.length - 1;
  return [...top.map((plan, col) => ({ plan, row: 0, col, back: false })), ...bottom.map((plan, i) => ({ plan, row: 1, col: turn - i, back: true }))];
}

/**
 * Seeded castle region: rooms a screen wide on one row, or from 0.2 two rows joined by a shaft, with doorways between
 * neighbours. Difficulty adds the second gate (from 0.2), halls, trenches, taller walls and enemies.
 */
export function generateRegion(params: LevelGenParams): LevelJson {
  const rng = new Rng(params.seed);
  const d = Math.max(0, Math.min(1, params.difficulty));
  const placed = mission(d);
  const cols = Math.max(...placed.map((p) => p.col)) + 1;
  const rows = Math.max(...placed.map((p) => p.row)) + 1;
  const width = cols * SCREEN_TILES;
  const height = rows * REGION_ROWS;
  const grid: Grid = Array.from({ length: height }, () => Array<string>(width).fill('#'));
  const set = (x: number, y: number, ch: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y]![x] = ch;
  };
  const at = (x: number, y: number) => grid[y]?.[x];
  const entities: LevelJson['entities'] = [];
  const rooms: LevelRoom[] = [];
  let walk = BASE_WALK;
  let spawn = { x: 0, y: 0 };
  let goal = { x: 0, y: 0 };
  const shafts: Array<{ x: number; top: number; bottom: number }> = [];
  for (const [i, p] of placed.entries()) {
    const { plan } = p;
    const x0 = p.col * SCREEN_TILES;
    const y0 = p.row * REGION_ROWS;
    // A room's own column to the region's: mirrored on the way back.
    const gx = (lx: number) => x0 + (p.back ? plan.w - 1 - lx : lx);
    const prev = placed[i - 1];
    // The side the player comes in by is a wall where they do not come in through a doorway: the region's first room,
    // and the room the shaft drops into.
    const entryWall = !prev || prev.row !== p.row;
    const room: Room = {
      w: plan.w,
      d,
      rng,
      floor(lx0, lx1, row) {
        for (let lx = Math.max(entryWall ? 1 : 0, lx0); lx <= Math.min(plan.w - 2, lx1); lx++) {
          for (let y = 1; y < REGION_ROWS; y++) set(gx(lx), y0 + y, y <= row ? '.' : '#');
        }
      },
      fill(lx0, ya, lx1, yb, ch) {
        for (let y = ya; y <= yb; y++) for (let lx = lx0; lx <= lx1; lx++) set(gx(lx), y0 + y, ch);
      },
      put(type, lx, y, props = {}) {
        entities.push({ type, x: gx(lx), y: y0 + y, props });
      },
      trench(lx0, lx1, row) {
        for (let lx = lx0; lx <= lx1; lx++) {
          for (let y = row + 1; y < REGION_ROWS - 1; y++) set(gx(lx), y0 + y, '.');
          set(gx(lx), y0 + REGION_ROWS - 1, '^');
        }
      },
      open(lx, row) {
        const x = gx(lx);
        return at(x, y0 + row) === '.' && at(x, y0 + row - 1) === '.' && at(x, y0 + row - 2) === '.' && at(x, y0 + row + 1) === '#';
      },
    };
    const entry = prev && prev.row !== p.row ? BASE_WALK : walk;
    walk = plan.build(room, entry);
    if (plan === START) spawn = { x: gx(8), y: y0 + entry };
    if (plan === EXIT) goal = { x: gx(plan.w - 5), y: y0 + walk };
    const next = placed[i + 1];
    if (next && next.row === p.row) {
      // A doorway in the wall the player leaves by.
      for (let y = walk - DOOR_ROWS + 1; y <= walk; y++) set(gx(plan.w - 1), y0 + y, '.');
    } else if (next) {
      // The way turns down to the next row: a shaft at the far end of this room, cut once the room below is built.
      shafts.push({ x: gx(plan.w - 2 - SHAFT_TILES), top: y0 + walk, bottom: next.row * REGION_ROWS + BASE_WALK });
    }
    rooms.push({ id: plan.id, x: x0, y: y0, w: plan.w, h: REGION_ROWS, kind: plan.kind });
  }
  // The shortcut: from 0.2 the way out lies under the first altar's room. A shaft climbs from its floor to the altar room's
  // floor, whose top row a gate closes until a head meets it from below: once open, the end of the way joins the first
  // rest, both ways (a fall down the shaft, the wings up it). The gate is the floor's top row only, so the top ledge sits
  // a row higher and the climb out of the shaft is the rise of an air jump under the heaviest feel (four tiles).
  const exitRoom = rooms.find((r) => r.kind === 'exit');
  const firstAltar = rooms.find((r) => r.kind === 'save');
  if (exitRoom && firstAltar && exitRoom.x === firstAltar.x && exitRoom.y === firstAltar.y + REGION_ROWS) {
    const sx = firstAltar.x + SHORTCUT_COLUMN;
    const gateRow = firstAltar.y + BASE_WALK + 1;
    const floor = exitRoom.y + BASE_WALK;
    const tall = Math.ceil(PLAYER.h / 16);
    for (let x = sx; x < sx + GATE_TILES; x++) for (let y = gateRow + 1; y <= floor; y++) set(x, y, '.');
    // Ledges down from the highest row a body stands on with its head under the gate, every SHAFT_STEP rows, to the
    // last one above the floor; on alternate halves, the top one away from the altar.
    for (let k = 0, y = gateRow + tall + 1; y <= floor - SHAFT_STEP + 1; k++, y += SHAFT_STEP) {
      const from = k % 2 === 0 ? sx + GATE_TILES / 2 : sx;
      for (let x = from; x < from + GATE_TILES / 2; x++) set(x, y, '-');
    }
    entities.push({ type: GATE_TYPE, x: sx, y: gateRow, props: {} });
  }
  // Each shaft: the floor between the two walking rows taken away, and one-way ledges on alternate halves every
  // SHAFT_STEP rows from the floor below up to the one above, so a fall goes down past them and a jump climbs them.
  for (const sh of shafts) {
    for (let x = sh.x; x < sh.x + SHAFT_TILES; x++) for (let y = sh.top + 1; y <= sh.bottom; y++) set(x, y, '.');
    const half = SHAFT_TILES / 2;
    for (let k = 0, y = sh.bottom - SHAFT_STEP + 1; y > sh.top; k++, y -= SHAFT_STEP) {
      const from = k % 2 === 0 ? sh.x : sh.x + half;
      for (let x = from; x < from + half; x++) set(x, y, '-');
    }
  }
  set(spawn.x, spawn.y, 'S');
  return {
    version: 1,
    id: `region-${params.seed}`,
    name: `Region ${params.seed}`,
    tileSize: 16,
    width,
    height,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal', S: 'spawn' },
    rows: grid.map((r) => r.join('')),
    entities,
    rooms,
    spawn,
    goal,
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}
