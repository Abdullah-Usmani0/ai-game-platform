import { mix, type RGB } from './color.js';
import type { ArtPalette } from './palette.js';
import { hash2, type PixelCanvas } from './pixels.js';

/**
 * The level itself. A level is drawn in one of four settings: side (rock under a sky), dungeon (3/4 walls, flagstone
 * floors, torchlight), field (grass, stone pillars) or space (nothing: stars behind). The painter works on the whole
 * level, not tile by tile: rock darkens with depth below its surface, moss grows on top of it, walls cast shadows on
 * the floor and torches light it. Everything is seeded by position, so a level looks the same every time it loads.
 */

export type Setting = 'side' | 'dungeon' | 'field' | 'space';

/** The setting each genre is drawn in; a genre not listed here falls back by how its player moves. */
export const SETTING_BY_GENRE: Readonly<Record<string, Setting>> = {
  platformer: 'side',
  metroidvania: 'side',
  'topdown-action': 'dungeon',
  puzzle: 'dungeon',
  roguelike: 'dungeon',
  deckbuilder: 'dungeon',
  survivors: 'field',
  lifesim: 'field',
  shmup: 'space',
};

export function settingFor(genre: string | undefined, movementMode: 'platformer' | 'topdown' | undefined): Setting {
  return SETTING_BY_GENRE[genre ?? ''] ?? (movementMode === 'topdown' ? 'dungeon' : 'side');
}

/** What the painter reads from a level (the sim's tilemap satisfies it). */
export interface TerrainMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  kindAt(tx: number, ty: number): string;
}

export interface Light {
  x: number;
  y: number;
  radius: number;
}

export interface LevelArt {
  pal: ArtPalette;
  setting: Setting;
  map: TerrainMap;
  /** Per pixel of the level: distance from a solid pixel to the nearest open one (0 = open, 1 = an edge). Side settings only. */
  depth: Uint8Array | null;
  /** Torchlight baked into the floor (dungeon settings). */
  lights: Light[];
  exitLocked: boolean;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold in 0..1 for a pixel. */
export const bayer = (x: number, y: number): number => (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

function kindAt(map: TerrainMap, tx: number, ty: number): string {
  return tx < 0 || ty < 0 || tx >= map.width || ty >= map.height ? 'solid' : map.kindAt(tx, ty);
}

const solidTile = (map: TerrainMap, tx: number, ty: number) => kindAt(map, tx, ty) === 'solid';
const solidPx = (map: TerrainMap, x: number, y: number) => solidTile(map, Math.floor(x / map.tileSize), Math.floor(y / map.tileSize));

/** Two-pass chamfer distance (3-4 metric) from every solid pixel to the nearest open pixel; outside the level counts as rock. */
export function depthField(map: TerrainMap): Uint8Array {
  const ts = map.tileSize;
  const W = map.width * ts;
  const H = map.height * ts;
  const INF = 60000;
  const d = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = map.kindAt(Math.floor(x / ts), Math.floor(y / ts)) === 'solid' ? INF : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i]!;
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1]! + 3);
      if (y > 0) {
        v = Math.min(v, d[i - W]! + 3);
        if (x > 0) v = Math.min(v, d[i - W - 1]! + 4);
        if (x < W - 1) v = Math.min(v, d[i - W + 1]! + 4);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i]!;
      if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, d[i + 1]! + 3);
      if (y < H - 1) {
        v = Math.min(v, d[i + W]! + 3);
        if (x < W - 1) v = Math.min(v, d[i + W + 1]! + 4);
        if (x > 0) v = Math.min(v, d[i + W - 1]! + 4);
      }
      d[i] = v;
    }
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.round(d[i]! / 3));
  return out;
}

/** Where a dungeon's torches hang: straight stretches of wall facing into a room, at least seven tiles apart. */
export function torchSpots(map: TerrainMap): Array<{ tx: number; ty: number }> {
  const spots: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!solidTile(map, tx, ty) || solidTile(map, tx, ty + 1) || solidTile(map, tx, ty + 2)) continue;
      if (!solidTile(map, tx - 1, ty) || !solidTile(map, tx + 1, ty)) continue;
      if (hash2(tx, ty, 83) > 0.55) continue;
      if (spots.some((s) => Math.max(Math.abs(s.tx - tx), Math.abs(s.ty - ty)) < 7)) continue;
      spots.push({ tx, ty });
    }
  }
  return spots;
}

export function prepareLevelArt(pal: ArtPalette, setting: Setting, map: TerrainMap, exitLocked: boolean): LevelArt {
  const ts = map.tileSize;
  const lights = setting === 'dungeon' ? torchSpots(map).map((s) => ({ x: s.tx * ts + ts / 2, y: (s.ty + 1) * ts, radius: Math.max(40, ts * 4.5) })) : [];
  return { pal, setting, map, depth: setting === 'side' ? depthField(map) : null, lights, exitLocked };
}

// ---------------------------------------------------------------- cobbles

/** Rounded stones on a jittered grid: which stone a pixel is in, and how close it is to the stone's edge. */
function cobble(x: number, y: number, cw: number, ch: number, seed: number): { id: number; edge: number; above: boolean } {
  const cx = Math.floor(x / cw);
  const cy = Math.floor(y / ch);
  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  let fy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const px = (gx + 0.2 + hash2(gx, gy, seed) * 0.6) * cw;
      const py = (gy + 0.2 + hash2(gy, gx, seed + 1) * 0.6) * ch;
      const dd = Math.hypot((x + 0.5 - px) / cw, (y + 0.5 - py) / ch);
      if (dd < f1) {
        f2 = f1;
        f1 = dd;
        id = gx * 7919 + gy;
        fy = py;
      } else if (dd < f2) f2 = dd;
    }
  }
  return { id, edge: (f2 - f1) * Math.min(cw, ch), above: y + 0.5 < fy };
}

// ---------------------------------------------------------------- side view

/** Rock: moss on top, lit left edges, shadowed right and under edges, cobbles that fade into darkness with depth. */
function paintSideRock(art: LevelArt, pc: PixelCanvas, x0: number, y0: number, gx: number, gy: number): void {
  const { pal, map } = art;
  const T = pal.terrain;
  const R = pal.rim;
  const ts = map.tileSize;
  const W = map.width * ts;
  const dv = art.depth ? art.depth[gy * W + gx]! : 4;
  const px = gx - x0;
  const py = gy - y0;
  const openU = !solidPx(map, gx, gy - 1);
  const openL = !solidPx(map, gx - 1, gy);
  const openR = !solidPx(map, gx + 1, gy);
  const openD = !solidPx(map, gx, gy + 1);
  // Convex corners are rounded off.
  if ((openU && (openL || openR)) || (openD && (openL || openR))) return;
  // Moss: two or three pixels under an open surface, ragged at the bottom.
  let fromTop = -1;
  for (let i = 1; i <= 4; i++) {
    if (!solidPx(map, gx, gy - i)) {
      fromTop = i - 1;
      break;
    }
  }
  const col = Math.floor(gy / ts);
  const mossDepth = 2 + (hash2(gx, col, 5) < 0.45 ? 1 : 0) + (hash2(gx, col, 9) < 0.14 ? 1 : 0);
  if (fromTop >= 0 && fromTop < mossDepth) {
    let c: RGB = fromTop === 0 ? R[3] : fromTop === mossDepth - 1 ? R[1] : R[2];
    if (fromTop === 0 && hash2(gx, gy, 11) < 0.18) c = R[4];
    if (fromTop === 0 && (openL || openR)) c = R[2];
    pc.set(px, py, c);
    return;
  }
  if (dv <= 1) {
    pc.set(px, py, openD ? T[0] : openL ? T[3] : openR ? T[1] : T[2]);
    return;
  }
  // Depth bands, dithered into each other: the surface reads bright, deep rock falls away to near black.
  const band = dv + (bayer(gx, gy) - 0.5) * 2.6;
  const level = band < 5 ? 2 : band < 10 ? 1 : 0;
  const { id, edge, above } = cobble(gx, gy, 7, 5, 31);
  const tone = hash2(id, 3, 37);
  let c: RGB = level === 2 ? (tone < 0.22 ? mix(T[2], T[1], 0.35) : T[2]) : level === 1 ? T[1] : mix(T[0], pal.ink, 0.35);
  if (edge < 0.9) c = level === 2 ? T[1] : level === 1 ? mix(T[1], T[0], 0.6) : mix(T[0], pal.ink, 0.7);
  else if (level === 2 && above && edge < 1.9) c = mix(T[2], T[3], 0.55);
  pc.set(px, py, c);
}

/** Spikes: light left faces, dark right faces, on a dark base (pointing down when hung from a ceiling). */
function paintSpikes(pal: ArtPalette, pc: PixelCanvas, ox: number, oy: number, ts: number, down: boolean): void {
  const D = pal.danger;
  const n = Math.max(2, Math.round(ts / 4));
  const w = Math.floor(ts / n);
  const tall = Math.max(3, Math.round(ts * 0.6));
  const put = (x: number, y: number, c: RGB) => pc.set(ox + x, oy + (down ? ts - 1 - y : y), c);
  for (let i = 0; i < n; i++) {
    const cx = i * w + Math.floor((w - 1) / 2);
    for (let r = 0; r < tall; r++) {
      const half = Math.floor((r / (tall - 1)) * ((w - 1) / 2));
      for (let dx = -half; dx <= half; dx++) put(cx + dx, ts - 1 - tall + r, r === 0 ? D[4] : dx < 0 ? D[3] : dx === 0 ? D[4] : D[1]);
    }
  }
  for (let x = 0; x < ts; x++) {
    put(x, ts - 1, D[0]);
    put(x, ts - 2, x % 2 ? D[1] : D[0]);
  }
}

/** A one-way plank: a lit top edge, a body with a grain, and the rails it rests on. */
function paintPlank(pal: ArtPalette, pc: PixelCanvas, ox: number, oy: number, ts: number, tx: number, ends: { l: boolean; r: boolean }): void {
  const W = pal.wood;
  for (let x = 0; x < ts; x++) {
    const gx = tx * ts + x;
    pc.set(ox + x, oy, W[4]);
    pc.set(ox + x, oy + 1, gx % 7 === 0 ? W[1] : W[3]);
    pc.set(ox + x, oy + 2, W[1]);
  }
  if (ends.l) {
    for (let y = 0; y < 3; y++) pc.set(ox, oy + y, W[0]);
    pc.set(ox + 1, oy + 3, W[0]);
    pc.set(ox + 1, oy + 4, W[1]);
  }
  if (ends.r) {
    for (let y = 0; y < 3; y++) pc.set(ox + ts - 1, oy + y, W[0]);
    pc.set(ox + ts - 2, oy + 3, W[0]);
    pc.set(ox + ts - 2, oy + 4, W[1]);
  }
}

/** Grass tufts and flowers along open rims, and roots hanging from ceilings. */
function paintSideDetails(art: LevelArt, pc: PixelCanvas, x0: number, y0: number): void {
  const { pal, map } = art;
  const R = pal.rim;
  // Surfaces just outside this region still grow into it (tufts reach up, roots hang down): look a few rows beyond it.
  for (let py = -5; py < pc.h + 5; py++) {
    for (let px = 0; px < pc.w; px++) {
      const gx = x0 + px;
      const gy = y0 + py;
      if (gy < 0 || gy >= map.height * map.tileSize || !solidPx(map, gx, gy)) continue;
      // A surface pixel with open air above: tufts grow up into the air.
      if (!solidPx(map, gx, gy - 1) && solidPx(map, gx - 1, gy) && solidPx(map, gx + 1, gy)) {
        const roll = hash2(gx, gy, 61);
        if (roll < 0.11) {
          const tall = roll < 0.03 ? 3 : 2;
          for (let k = 1; k <= tall; k++) pc.set(px, py - k, k === tall ? R[4] : R[3]);
          if (roll < 0.012) pc.set(px, py - tall - 1, [pal.accent[3], pal.white, pal.danger[3]][Math.floor(hash2(gx, gy, 79) * 3)]!);
        } else if (roll < 0.2) pc.set(px, py - 1, R[3]);
      }
      // A ceiling pixel with open air below: roots and moss hang down.
      if (!solidPx(map, gx, gy + 1)) {
        const roll = hash2(gx, gy, 71);
        if (roll < 0.07) {
          const len = 1 + Math.floor(hash2(gy, gx, 73) * 4);
          for (let k = 1; k <= len; k++) pc.set(px, py + k, k === len ? R[2] : R[1]);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- top-down

/** Flagstones (dungeon) or grass (field), with the shadow walls cast to their south and east. */
function paintFloorPx(art: LevelArt, gx: number, gy: number): RGB {
  const { pal, map, setting } = art;
  const ts = map.tileSize;
  const tx = Math.floor(gx / ts);
  const ty = Math.floor(gy / ts);
  const lx = gx - tx * ts;
  const ly = gy - ty * ts;
  let c: RGB;
  if (setting === 'field') {
    const G = pal.rim;
    // Large soft patches of lighter and darker grass, dithered at their edges.
    const n = valueNoise(gx / 22, gy / 22, 41) * 0.65 + valueNoise(gx / 9, gy / 9, 43) * 0.35;
    const t = n + (bayer(gx, gy) - 0.5) * 0.12;
    c = t > 0.62 ? G[2] : t > 0.38 ? mix(G[1], G[2], 0.45) : G[1];
  } else {
    const F = pal.floor;
    // Square flagstones (two tiles across on small tiles, one tile on large ones), each its own shade.
    const sw = ts >= 16 ? ts : ts * 2;
    const sh = sw;
    const row = Math.floor(gy / sh);
    const colI = Math.floor(gx / sw);
    const sx = gx % sw;
    const sy = gy % sh;
    const tone = hash2(colI, row, 47);
    const base = tone < 0.2 ? mix(F[2], F[1], 0.35) : tone > 0.85 ? mix(F[2], F[3], 0.25) : F[2];
    if (sx === 0 || sy === 0) c = F[0];
    else if (sy === 1 || sx === 1) c = mix(base, F[3], 0.4);
    else if (sy === sh - 1 || sx === sw - 1) c = mix(base, F[1], 0.5);
    else c = base;
    // A crack across some stones, a chip out of others.
    if (c === base && hash2(colI, row, 53) < 0.18) {
      const ax = 2 + Math.floor(hash2(colI, row, 59) * (sw - 6));
      const ay = 2 + Math.floor(hash2(row, colI, 61) * (sh - 5));
      const k = sx - ax;
      if (k >= 0 && k < 4 && sy - ay === Math.floor(k * 0.7)) c = F[1];
    }
    if (c === base && hash2(gx, gy, 67) < 0.012) c = F[3];
  }
  // Walls to the north and west cast a short shadow (the light comes from the top left).
  const shadowN = solidTile(map, tx, ty - 1) ? Math.max(0, 3 - ly) : 0;
  const shadowW = solidTile(map, tx - 1, ty) ? Math.max(0, 2 - lx) : 0;
  const shadow = Math.max(shadowN, shadowW);
  if (shadow > 0) c = mix(c, pal.ink, shadow === 3 ? 0.55 : shadow === 2 ? 0.38 : 0.2);
  return c;
}

/** Field details: tufts, pebbles and the odd flower, one per tile at most. */
function paintFieldDetails(art: LevelArt, pc: PixelCanvas, x0: number, y0: number): void {
  const { pal, map } = art;
  const ts = map.tileSize;
  const G = pal.rim;
  for (let ty = Math.floor(y0 / ts); ty < Math.ceil((y0 + pc.h) / ts); ty++) {
    for (let tx = Math.floor(x0 / ts); tx < Math.ceil((x0 + pc.w) / ts); tx++) {
      if (kindAt(map, tx, ty) !== 'air' && kindAt(map, tx, ty) !== 'spawn') continue;
      const roll = hash2(tx, ty, 91);
      const ox = tx * ts - x0 + 1 + Math.floor(hash2(tx, ty, 93) * Math.max(1, ts - 6));
      const oy = ty * ts - y0 + 2 + Math.floor(hash2(ty, tx, 95) * Math.max(1, ts - 5));
      if (roll < 0.2) {
        const t = TUFT_SHAPES[Math.floor(hash2(tx, ty, 97) * TUFT_SHAPES.length)]!;
        t.forEach((r, y) => {
          for (let x = 0; x < r.length; x++) if (r[x] === '#') pc.set(ox + x, oy + y, y === 0 ? G[4] : G[3]);
        });
        pc.set(ox + 1, oy + t.length, G[0]);
      } else if (roll < 0.24) {
        pc.set(ox, oy, [pal.accent[3], pal.white, pal.danger[3]][Math.floor(hash2(tx, ty, 99) * 3)]!);
        pc.set(ox, oy + 1, G[3]);
      } else if (roll < 0.28) {
        pc.set(ox, oy, pal.terrain[3]);
        pc.set(ox + 1, oy, pal.terrain[2]);
        pc.set(ox, oy + 1, G[0]);
        pc.set(ox + 1, oy + 1, G[0]);
      }
    }
  }
}

const TUFT_SHAPES = [['#.#', '###'], ['.#.#', '#.##'], ['#..#', '####']];

/**
 * A top-down wall in 3/4 view: a lit top face, and with open floor below it a brick front face. Field walls are stone
 * pillars with moss on their tops.
 */
function paintWallPx(art: LevelArt, gx: number, gy: number): RGB {
  const { pal, map, setting } = art;
  const T = pal.terrain;
  const ts = map.tileSize;
  const tx = Math.floor(gx / ts);
  const ty = Math.floor(gy / ts);
  const lx = gx - tx * ts;
  const ly = gy - ty * ts;
  const face = !solidTile(map, tx, ty + 1);
  const top = face ? Math.max(3, Math.round(ts * 0.45)) : ts;
  const openN = !solidTile(map, tx, ty - 1);
  const openW = !solidTile(map, tx - 1, ty);
  const openE = !solidTile(map, tx + 1, ty);
  if (ly < top) {
    if (ly === 0 && openN) return setting === 'field' ? pal.rim[3] : T[4];
    if ((lx === 0 && openW) || (lx === ts - 1 && openE)) return T[1];
    if (setting === 'field' && ly <= 1 && openN) return pal.rim[2];
    // The top face is a flat cap: one tone, a lip of shadow where it meets the front face, the odd worn stone.
    if (face && ly === top - 1) return T[2];
    return hash2(Math.floor(gx / 4), Math.floor(gy / 4), 103) < 0.12 ? mix(T[3], T[2], 0.35) : T[3];
  }
  // Front face: courses of bricks, darker toward the floor.
  const row = ly - top;
  const brickH = ts >= 16 ? 4 : 3;
  const course = Math.floor(row / brickH);
  const mortar = row % brickH === brickH - 1 || (gx + course * 3) % 6 === 0;
  if (ly === ts - 1) return mix(T[0], pal.ink, 0.4);
  if ((lx === 0 && openW) || (lx === ts - 1 && openE)) return T[0];
  if (mortar) return T[0];
  const tone = hash2(Math.floor((gx + course * 3) / 6), Math.floor(gy / brickH), 107);
  return row % brickH === 0 ? (tone < 0.5 ? mix(T[1], T[2], 0.7) : T[2]) : tone < 0.3 ? mix(T[1], T[0], 0.3) : T[1];
}

/** A top-down exit: stairs going down into the dark, behind bars while it is locked. */
function paintStairs(art: LevelArt, pc: PixelCanvas, ox: number, oy: number, ts: number): void {
  const { pal } = art;
  const steps = Math.max(3, Math.floor(ts / 2.5));
  const stepH = ts / steps;
  for (let y = 0; y < ts; y++) {
    const step = Math.floor(y / stepH);
    const c = mix(pal.floor[2], pal.ink, (step + 1) / (steps + 1));
    const lip = y - step * stepH < 1;
    for (let x = 0; x < ts; x++) pc.set(ox + x, oy + y, x === 0 || x === ts - 1 ? pal.terrain[1] : lip ? mix(c, pal.floor[3], 0.5) : c);
  }
  if (art.exitLocked) {
    for (let x = 1; x < ts - 1; x += 3) {
      for (let y = 0; y < ts; y++) pc.set(ox + x, oy + y, y === 0 ? pal.terrain[4] : pal.terrain[3]);
      for (let y = 1; y < ts; y++) pc.set(ox + x + 1, oy + y, pal.terrain[1]);
    }
    for (let x = 0; x < ts; x++) {
      pc.set(ox + x, oy + 1, pal.terrain[3]);
      pc.set(ox + x, oy + ts - 2, pal.terrain[2]);
    }
  } else {
    for (let x = 1; x < ts - 1; x++) pc.set(ox + x, oy, pal.accent[3]);
  }
}

// ---------------------------------------------------------------- noise and light

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Torchlight: the floor sits in shadow, pools of warm light around each torch, in a few dithered bands. */
function applyLight(art: LevelArt, pc: PixelCanvas, x0: number, y0: number): void {
  if (art.lights.length === 0) return;
  const warm = art.pal.accent[3];
  const near = art.lights.filter((l) => l.x + l.radius > x0 && l.x - l.radius < x0 + pc.w && l.y + l.radius > y0 && l.y - l.radius < y0 + pc.h);
  for (let py = 0; py < pc.h; py++) {
    for (let px = 0; px < pc.w; px++) {
      const i = (py * pc.w + px) * 4;
      if (pc.data[i + 3] === 0) continue;
      const gx = x0 + px;
      const gy = y0 + py;
      let light = 0;
      for (const l of near) {
        const d = Math.hypot(gx - l.x, (gy - l.y) * 1.15) / l.radius;
        if (d < 1) light += (1 - d) ** 1.5;
      }
      const raw = 0.68 + Math.min(1, light) * 0.58 + (bayer(gx, gy) - 0.5) * 0.08;
      const f = Math.round(raw / 0.085) * 0.085;
      const tint = Math.max(0, f - 0.8) * 0.45;
      for (let k = 0; k < 3; k++) pc.data[i + k] = Math.max(0, Math.min(255, Math.round(pc.data[i + k]! * f * (1 - tint) + warm[k]! * tint)));
    }
  }
}

// ---------------------------------------------------------------- the painter

/** Paints the part of the level that `pc` covers, whose top-left is pixel (x0, y0) of the level. */
export function paintRegion(art: LevelArt, pc: PixelCanvas, x0: number, y0: number): void {
  const { pal, map, setting } = art;
  if (setting === 'space') return;
  const ts = map.tileSize;
  for (let py = 0; py < pc.h; py++) {
    for (let px = 0; px < pc.w; px++) {
      const gx = x0 + px;
      const gy = y0 + py;
      const tx = Math.floor(gx / ts);
      const ty = Math.floor(gy / ts);
      const kind = kindAt(map, tx, ty);
      if (setting === 'side') {
        if (kind === 'solid') paintSideRock(art, pc, x0, y0, gx, gy);
      } else if (kind === 'solid') pc.set(px, py, paintWallPx(art, gx, gy));
      else pc.set(px, py, paintFloorPx(art, gx, gy));
    }
  }
  // Tile-sized features drawn over the base.
  for (let ty = Math.floor(y0 / ts); ty < Math.ceil((y0 + pc.h) / ts); ty++) {
    for (let tx = Math.floor(x0 / ts); tx < Math.ceil((x0 + pc.w) / ts); tx++) {
      const kind = kindAt(map, tx, ty);
      const ox = tx * ts - x0;
      const oy = ty * ts - y0;
      if (kind === 'hazard') {
        if (setting !== 'side') {
          // A floor trap: a dark plate the spikes come out of.
          for (let y = 1; y < ts - 1; y++) for (let x = 1; x < ts - 1; x++) pc.set(ox + x, oy + y, mix(pal.floor[1], pal.ink, 0.4));
        }
        paintSpikes(pal, pc, ox, oy, ts, setting === 'side' && solidTile(map, tx, ty - 1) && !solidTile(map, tx, ty + 1));
      } else if (kind === 'oneway') {
        paintPlank(pal, pc, ox, oy, ts, tx, { l: kindAt(map, tx - 1, ty) !== 'oneway', r: kindAt(map, tx + 1, ty) !== 'oneway' });
      } else if (kind === 'goal' && setting === 'dungeon') {
        paintStairs(art, pc, ox, oy, ts);
      }
    }
  }
  if (setting === 'side') paintSideDetails(art, pc, x0, y0);
  if (setting === 'field') paintFieldDetails(art, pc, x0, y0);
  if (setting === 'dungeon') applyLight(art, pc, x0, y0);
}

