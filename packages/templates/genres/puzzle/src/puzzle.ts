import type { LevelJson } from '@gg/schemas';

/**
 * The Sokoban model shared by the validator, the generator, the solver bot and the grid-push system: a board of walls,
 * targets, crates and the player on cell indices, with a one-cell wall border so neighbour arithmetic never leaves it.
 * Board cell (x, y) is level tile (x - 1, y - 1).
 */
export interface Board {
  /** Padded size: the level's width and height plus 2. */
  width: number;
  height: number;
  /** 1 where the cell is a wall: solid tiles, anything but floor, and the border around the level. */
  walls: Uint8Array;
  /** Sorted cell indices. */
  targets: number[];
  /** Sorted cell indices; the same count as targets in a well-formed level. */
  crates: number[];
  player: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
export const DIR_VEC: Record<Dir, { dx: number; dy: number }> = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

export const CRATE_TYPE = 'crate';
export const TARGET_TYPE = 'target';

/** Tile kinds a player and a crate may stand on. */
const FLOOR_KINDS = new Set(['air', 'spawn', 'goal']);

export const offset = (b: Pick<Board, 'width'>, d: Dir): number => DIR_VEC[d].dx + DIR_VEC[d].dy * b.width;
export const cellOf = (b: Pick<Board, 'width'>, tx: number, ty: number): number => tx + 1 + (ty + 1) * b.width;
export const tileOf = (b: Pick<Board, 'width'>, cell: number): { x: number; y: number } => ({ x: (cell % b.width) - 1, y: Math.floor(cell / b.width) - 1 });

/** A board from tile kinds and entity cells (tile coordinates); out-of-range tiles are walls. */
export function makeBoard(width: number, height: number, isFloor: (tx: number, ty: number) => boolean, crates: Array<{ x: number; y: number }>, targets: Array<{ x: number; y: number }>, player: { x: number; y: number }): Board {
  const b = { width: width + 2, height: height + 2 };
  const walls = new Uint8Array(b.width * b.height).fill(1);
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) if (isFloor(tx, ty)) walls[cellOf(b, tx, ty)] = 0;
  const inside = (t: { x: number; y: number }) => t.x >= 0 && t.y >= 0 && t.x < width && t.y < height;
  const cells = (list: Array<{ x: number; y: number }>) => list.filter(inside).map((t) => cellOf(b, t.x, t.y)).sort((a, c) => a - c);
  return { ...b, walls, crates: cells(crates), targets: cells(targets), player: inside(player) ? cellOf(b, player.x, player.y) : 0 };
}

/** The board a level describes: floor tiles, crate and target entities, the spawn as the player. */
export function boardFromLevel(level: LevelJson): Board {
  const kinds = level.rows.map((row) => [...row].map((ch) => level.legend[ch] ?? 'solid'));
  const isFloor = (tx: number, ty: number) => FLOOR_KINDS.has(kinds[ty]?.[tx] ?? 'solid');
  return makeBoard(
    level.width,
    level.height,
    isFloor,
    level.entities.filter((e) => e.type === CRATE_TYPE),
    level.entities.filter((e) => e.type === TARGET_TYPE),
    level.spawn,
  );
}

export const isSolved = (b: Pick<Board, 'crates' | 'targets'>): boolean => b.crates.length === b.targets.length && b.crates.every((c, i) => c === b.targets[i]);

/** Key of a position up to player moves: the crate cells and the smallest cell the player can walk to. */
export function boardKey(b: Board): string {
  return `${normalPlayer(b, b.crates, b.player)}|${b.crates.join(',')}`;
}

/**
 * Fewest pushes from each cell to the nearest target, ignoring the other crates; -1 where no target can ever be
 * reached (a dead cell). Found by pulling a crate backwards from every target at once: it moves from c to c - d
 * with the player standing at c - 2d.
 */
export function pushDistances(b: Board): Int16Array {
  const dist = new Int16Array(b.walls.length).fill(-1);
  const queue: number[] = [];
  for (const t of b.targets) {
    dist[t] = 0;
    queue.push(t);
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    for (const d of DIRS) {
      const o = offset(b, d);
      const prev = c - o;
      if (dist[prev] === -1 && !b.walls[prev] && !b.walls[prev - o]) {
        dist[prev] = dist[c]! + 1;
        queue.push(prev);
      }
    }
  }
  return dist;
}

/** 1 where a crate can still be pushed onto some target ("live"); a crate on any other cell is stuck for good. */
export function liveCells(b: Board): Uint8Array {
  return Uint8Array.from(pushDistances(b), (v) => (v >= 0 ? 1 : 0));
}

/** Marks every cell the player reaches from `from` without crossing walls or crates; returns the cells in BFS order. */
function flood(b: Board, crateMask: Uint8Array, from: number, seen: Int32Array, stamp: number): number[] {
  const order = [from];
  seen[from] = stamp;
  for (let i = 0; i < order.length; i++) {
    const c = order[i]!;
    for (const d of DIRS) {
      const n = c + offset(b, d);
      if (seen[n] !== stamp && !b.walls[n] && !crateMask[n]) {
        seen[n] = stamp;
        order.push(n);
      }
    }
  }
  return order;
}

function maskOf(size: number, crates: readonly number[]): Uint8Array {
  const m = new Uint8Array(size);
  for (const c of crates) m[c] = 1;
  return m;
}

function normalPlayer(b: Board, crates: readonly number[], player: number): number {
  const order = flood(b, maskOf(b.walls.length, crates), player, new Int32Array(b.walls.length), 1);
  let min = player;
  for (const c of order) if (c < min) min = c;
  return min;
}

/** Shortest walk for the player from `from` to `to` around walls and crates, or null. */
export function walkPath(b: Board, crates: readonly number[], from: number, to: number): Dir[] | null {
  if (from === to) return [];
  const mask = maskOf(b.walls.length, crates);
  const prev = new Int32Array(b.walls.length).fill(-1);
  const via = new Array<Dir>(b.walls.length);
  prev[from] = from;
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    for (const d of DIRS) {
      const n = c + offset(b, d);
      if (prev[n] !== -1 || b.walls[n] || mask[n]) continue;
      prev[n] = c;
      via[n] = d;
      if (n === to) {
        const path: Dir[] = [];
        for (let k = n; k !== from; k = prev[k]!) path.push(via[k]!);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** True when the crate just pushed to `cell` closes a 2x2 block of walls and crates holding a crate off its target. */
function frozenSquare(b: Board, mask: Uint8Array, targets: Uint8Array, cell: number): boolean {
  const right = 1;
  const down = b.width;
  for (const corner of [cell, cell - right, cell - down, cell - right - down]) {
    const square = [corner, corner + right, corner + down, corner + right + down];
    if (!square.every((c) => b.walls[c] || mask[c])) continue;
    if (square.some((c) => mask[c] && !targets[c])) return true;
  }
  return false;
}

export interface Solution {
  /** Every player move in order (walks and pushes): what the solver bot plays. */
  moves: Dir[];
  pushes: number;
  /** Positions the search expanded. */
  explored: number;
}

export type SolveResult = { status: 'solved'; solution: Solution } | { status: 'unsolvable'; explored: number } | { status: 'budget'; explored: number };

/** Min-heap of node ids by a numeric key. */
function heap() {
  const ids: number[] = [];
  const keys: number[] = [];
  const swap = (i: number, j: number) => {
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
  };
  return {
    size: () => ids.length,
    push(id: number, key: number) {
      ids.push(id);
      keys.push(key);
      for (let i = ids.length - 1; i > 0; ) {
        const up = (i - 1) >> 1;
        if (keys[up]! <= keys[i]!) break;
        swap(i, up);
        i = up;
      }
    },
    pop(): number {
      const top = ids[0]!;
      const lastId = ids.pop()!;
      const lastKey = keys.pop()!;
      if (ids.length > 0) {
        ids[0] = lastId;
        keys[0] = lastKey;
        for (let i = 0; ; ) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < ids.length && keys[l]! < keys[m]!) m = l;
          if (r < ids.length && keys[r]! < keys[m]!) m = r;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return top;
    },
  };
}

/**
 * Push-optimal A* over positions (crate cells + the player's region). The heuristic is each crate's fewest pushes to
 * its nearest target, ignoring the others: it never overestimates and a push changes it by at most one, so the
 * first solution taken off the queue has the fewest pushes. Pushes onto dead cells and into 2x2 freezes are pruned.
 * `maxStates` bounds the positions expanded (the validator's step budget); the moves of the found solution walk the
 * shortest path to each push.
 */
export function solve(start: Board, opts: { maxStates?: number } = {}): SolveResult {
  const maxStates = opts.maxStates ?? 100_000;
  if (isSolved(start)) return { status: 'solved', solution: { moves: [], pushes: 0, explored: 0 } };
  const size = start.walls.length;
  const dist = pushDistances(start);
  const targets = maskOf(size, start.targets);
  const dirOffsets = DIRS.map((d) => offset(start, d));
  // Scratch buffers shared by every flood: crate mask, visit stamps, queue.
  const mask = new Uint8Array(size);
  const seen = new Int32Array(size);
  const queue = new Int32Array(size);
  let stamp = 0;
  /** Floods the player's region from `from` (marking seen with a new stamp) and returns its smallest cell. */
  const floodFrom = (from: number): number => {
    stamp++;
    let head = 0;
    let tail = 0;
    let min = from;
    queue[tail++] = from;
    seen[from] = stamp;
    while (head < tail) {
      const c = queue[head++]!;
      if (c < min) min = c;
      for (const o of dirOffsets) {
        const n = c + o;
        if (seen[n] !== stamp && !start.walls[n] && !mask[n]) {
          seen[n] = stamp;
          queue[tail++] = n;
        }
      }
    }
    return min;
  };
  const estimate = (crates: readonly number[]) => crates.reduce((sum, c) => sum + dist[c]!, 0);
  // Compact keys: one UTF-16 unit per cell while every index fits in one (boards under 65,536 cells).
  const keyOf = size < 65536 ? (norm: number, crates: readonly number[]) => String.fromCharCode(norm, ...crates) : (norm: number, crates: readonly number[]) => `${norm}|${crates.join(',')}`;

  const nodeCrates: number[][] = [];
  const nodePlayer: number[] = [];
  const nodeNorm: number[] = [];
  const nodeG: number[] = [];
  const parent: number[] = [];
  const pushCrate: number[] = [];
  const pushDir: Dir[] = [];
  const best = new Map<string, number>();
  const open = heap();
  // Lower f first; among equals the deeper position (larger g), which reaches solutions sooner.
  const add = (crates: number[], player: number, norm: number, g: number, from: number, crate: number, dir: Dir) => {
    nodeCrates.push(crates);
    nodePlayer.push(player);
    nodeNorm.push(norm);
    nodeG.push(g);
    parent.push(from);
    pushCrate.push(crate);
    pushDir.push(dir);
    best.set(keyOf(norm, crates), g);
    open.push(nodeCrates.length - 1, (g + estimate(crates)) * 4096 - g);
  };
  for (const c of start.crates) mask[c] = 1;
  add(start.crates, start.player, floodFrom(start.player), 0, -1, -1, 'up');
  for (const c of start.crates) mask[c] = 0;

  let expanded = 0;
  while (open.size() > 0) {
    const i = open.pop();
    const crates = nodeCrates[i]!;
    const g = nodeG[i]!;
    if (best.get(keyOf(nodeNorm[i]!, crates)) !== g) continue;
    if (crates.every((x, k) => x === start.targets[k])) return { status: 'solved', solution: rebuild(start, i, { nodeCrates, parent, pushCrate, pushDir }, expanded) };
    if (++expanded > maxStates) return { status: 'budget', explored: expanded };
    for (const c of crates) mask[c] = 1;
    floodFrom(nodePlayer[i]!);
    const reach = stamp;
    const moves: Array<[number, number]> = [];
    for (const c of crates) {
      for (let k = 0; k < 4; k++) {
        const o = dirOffsets[k]!;
        const to = c + o;
        if (seen[c - o] === reach && !start.walls[to] && !mask[to] && dist[to]! >= 0) moves.push([c, k]);
      }
    }
    for (const [c, k] of moves) {
      const to = c + dirOffsets[k]!;
      mask[c] = 0;
      mask[to] = 1;
      if (!frozenSquare(start, mask, targets, to)) {
        const norm = floodFrom(c);
        const next = crates.map((x) => (x === c ? to : x)).sort((a, b) => a - b);
        const known = best.get(keyOf(norm, next));
        if (known === undefined || g + 1 < known) add(next, c, norm, g + 1, i, c, DIRS[k]!);
      }
      mask[to] = 0;
      mask[c] = 1;
    }
    for (const c of crates) mask[c] = 0;
  }
  return { status: 'unsolvable', explored: expanded };
}

function rebuild(start: Board, goal: number, n: { nodeCrates: number[][]; parent: number[]; pushCrate: number[]; pushDir: Dir[] }, explored: number): Solution {
  const chain: number[] = [];
  for (let k = goal; n.parent[k]! >= 0; k = n.parent[k]!) chain.push(k);
  chain.reverse();
  const moves: Dir[] = [];
  let player = start.player;
  for (const k of chain) {
    const crates = n.nodeCrates[n.parent[k]!]!;
    const c = n.pushCrate[k]!;
    const d = n.pushDir[k]!;
    const walk = walkPath(start, crates, player, c - offset(start, d));
    if (!walk) throw new Error('solver: no walk to a push it found (bug)');
    moves.push(...walk, d);
    player = c;
  }
  return { moves, pushes: chain.length, explored };
}

/** One move on a board (a walk or a push); null when it is blocked. */
export function applyMove(b: Board, d: Dir): Board | null {
  const o = offset(b, d);
  const to = b.player + o;
  if (b.walls[to]) return null;
  const k = b.crates.indexOf(to);
  if (k < 0) return { ...b, player: to };
  const beyond = to + o;
  if (b.walls[beyond] || b.crates.includes(beyond)) return null;
  const crates = b.crates.map((x) => (x === to ? beyond : x)).sort((a, c) => a - c);
  return { ...b, crates, player: to };
}

/**
 * Reverse moves for the generator: the player stands next to a crate and steps away from it, pulling it along.
 * Returns every pull available from the player's region as { crate, dir } (the crate moves one cell in `dir`).
 */
export function pulls(b: Board): Array<{ crate: number; dir: Dir; stand: number }> {
  const mask = maskOf(b.walls.length, b.crates);
  const seen = new Int32Array(b.walls.length);
  flood(b, mask, b.player, seen, 1);
  const out: Array<{ crate: number; dir: Dir; stand: number }> = [];
  for (const c of b.crates) {
    for (const d of DIRS) {
      const o = offset(b, d);
      // The player stands at c + o and backs off to c + 2o; the crate follows into c + o.
      const stand = c + o;
      const back = stand + o;
      if (seen[stand] === 1 && !b.walls[back] && !mask[back]) out.push({ crate: c, dir: d, stand });
    }
  }
  return out;
}

export function applyPull(b: Board, pull: { crate: number; dir: Dir }): Board {
  const o = offset(b, pull.dir);
  const crates = b.crates.map((x) => (x === pull.crate ? pull.crate + o : x)).sort((a, c) => a - c);
  return { ...b, crates, player: pull.crate + 2 * o };
}

/** Cells of the player's region (walls and crates block). */
export function region(b: Board): number[] {
  return flood(b, maskOf(b.walls.length, b.crates), b.player, new Int32Array(b.walls.length), 1);
}
