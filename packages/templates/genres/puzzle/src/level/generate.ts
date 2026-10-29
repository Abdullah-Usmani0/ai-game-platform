import type { LevelJson } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';
import { applyPull, CRATE_TYPE, makeBoard, offset, pulls, pushDistances, region, TARGET_TYPE, tileOf, type Board } from '../puzzle.js';
import { validatePuzzle } from './validate.js';

/** Candidates per level; each is a full reverse-play board checked by the solver. */
const ATTEMPTS = 10;
/** Search budget per candidate: a board the solver cannot settle quickly is skipped, not shipped. */
const CANDIDATE_BUDGET = 20_000;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Crates for a difficulty: one for the opening levels, up to four at the top of the ramp. */
export function cratesFor(difficulty: number): number {
  const d = clamp01(difficulty);
  return d < 0.15 ? 1 : d < 0.45 ? 2 : d < 0.75 ? 3 : 4;
}

/** The fewest pushes a solution should need at a difficulty: 2 at the start, 18 at the top. */
export function pushTarget(difficulty: number): number {
  return 2 + Math.round(clamp01(difficulty) * 16);
}

/**
 * Reverse play: carve a walled room with a few inner walls, put every crate on its target, then walk the player
 * backwards pulling crates off for a seeded number of pulls. That start is solvable by construction (replay the pulls
 * as pushes); the forward solver measures the real difficulty (fewest pushes), and the candidate nearest the
 * difficulty's push target wins, with crates left on their targets counted against it.
 */
export function generatePuzzle(params: LevelGenParams): LevelJson {
  const d = clamp01(params.difficulty);
  const crates = Math.max(1, Math.min(6, Math.round(params['crates'] ?? cratesFor(d))));
  const goal = pushTarget(d);
  const rng = new Rng(params.seed);
  let best: { level: LevelJson; score: number } | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const level = candidate(rng, d, crates, `puzzle-${params.seed}`);
    if (!level) continue;
    const r = validatePuzzle(level, { budget: CANDIDATE_BUDGET });
    if (!r.ok) continue;
    const score = Math.abs(Number(r.metrics['pushes']) - goal) + 3 * Number(r.metrics['startOnTarget'] ?? 0);
    if (!best || score < best.score) best = { level, score };
    if (score <= 1) break;
  }
  return best?.level ?? starter(`puzzle-${params.seed}`);
}

function candidate(rng: Rng, d: number, crates: number, id: string): LevelJson | null {
  const width = 8 + Math.round(d * 3) + rng.int(2);
  const height = 7 + Math.round(d * 2);
  const grid = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.')));
  const floor = () => grid.flatMap((row, y) => row.flatMap((ch, x) => (ch === '.' ? [{ x, y }] : [])));
  // Inner walls: short bars and single blocks, each kept only if the floor stays in one piece.
  const shapes = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]]] as const;
  const walls = 1 + Math.round(d * 3) + rng.int(2);
  for (let placed = 0, tries = 0; placed < walls && tries < 40; tries++) {
    const shape = shapes[rng.int(shapes.length)]!;
    const ox = 2 + rng.int(Math.max(1, width - 5));
    const oy = 2 + rng.int(Math.max(1, height - 5));
    const cells = shape.map(([dx, dy]) => ({ x: ox + dx, y: oy + dy }));
    if (!cells.every((c) => grid[c.y]?.[c.x] === '.' && c.x < width - 1 && c.y < height - 1)) continue;
    for (const c of cells) grid[c.y]![c.x] = '#';
    if (connected(grid)) placed++;
    else for (const c of cells) grid[c.y]![c.x] = '.';
  }
  const cells = floor();
  if (cells.length < crates * 3 + 4) return null;
  const pick = () => cells.splice(rng.int(cells.length), 1)[0]!;
  // Targets away from corners leave room to pull their crates off.
  const targets: Array<{ x: number; y: number }> = [];
  for (let tries = 0; targets.length < crates && tries < 60 && cells.length > 0; tries++) {
    const t = pick();
    const walled = (dx: number, dy: number) => grid[t.y + dy]?.[t.x + dx] === '#';
    const corner = (walled(1, 0) || walled(-1, 0)) && (walled(0, 1) || walled(0, -1));
    if (corner && rng.chance(0.75)) continue;
    targets.push(t);
  }
  if (targets.length < crates) return null;
  const isFloor = (tx: number, ty: number) => grid[ty]?.[tx] === '.';
  let board: Board = makeBoard(width, height, isFloor, targets, targets, pick());
  const dist = pushDistances(board);
  const pullCount = 6 + Math.round(d * 30) + rng.int(6);
  for (let i = 0; i < pullCount; i++) {
    const options = pulls(board);
    if (options.length === 0) break;
    // Favour crates still on a target so every crate leaves home, then pulls that take a crate further from the
    // targets (more pushes to bring it back), more strongly the harder the board.
    const home = options.filter((o) => board.targets.includes(o.crate));
    const away = options.filter((o) => dist[o.crate + offset(board, o.dir)]! > dist[o.crate]!);
    const pool = home.length > 0 && rng.chance(0.7) ? home : away.length > 0 && rng.chance(0.4 + 0.5 * d) ? away : options;
    board = applyPull(board, pool[rng.int(pool.length)]!);
  }
  // Start the player anywhere it could have walked to.
  const reach = region(board);
  board = { ...board, player: reach[rng.int(reach.length)]! };
  const spawn = tileOf(board, board.player);
  const crateTiles = board.crates.map((c) => tileOf(board, c));
  return {
    version: 1,
    id,
    name: 'Puzzle',
    tileSize: 16,
    width,
    height,
    legend: { '#': 'solid', '.': 'air' },
    rows: grid.map((row) => row.join('')),
    entities: [...targets.map((t) => ({ type: TARGET_TYPE, x: t.x, y: t.y, props: {} })), ...crateTiles.map((c) => ({ type: CRATE_TYPE, x: c.x, y: c.y, props: {} }))],
    spawn,
    goal: targets[0]!,
  };
}

function connected(grid: string[][]): boolean {
  const open = grid.flatMap((row, y) => row.flatMap((ch, x) => (ch === '.' ? [`${x},${y}`] : [])));
  if (open.length === 0) return false;
  const seen = new Set([open[0]!]);
  const queue = [open[0]!];
  while (queue.length > 0) {
    const [x, y] = queue.pop()!.split(',').map(Number) as [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${x + dx},${y + dy}`;
      if (grid[y + dy]?.[x + dx] === '.' && !seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return seen.size === open.length;
}

/** The fallback when no candidate passes: one crate, three pushes along a corridor. */
function starter(id: string): LevelJson {
  return {
    version: 1,
    id,
    name: 'Puzzle',
    tileSize: 16,
    width: 8,
    height: 6,
    legend: { '#': 'solid', '.': 'air' },
    rows: ['########', '#......#', '#......#', '#......#', '#......#', '########'],
    entities: [
      { type: TARGET_TYPE, x: 6, y: 2, props: {} },
      { type: CRATE_TYPE, x: 3, y: 2, props: {} },
    ],
    spawn: { x: 1, y: 2 },
    goal: { x: 6, y: 2 },
  };
}
