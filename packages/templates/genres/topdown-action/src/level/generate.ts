import type { LevelJson } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';

interface Cell {
  c: number;
  r: number;
}

/**
 * Rooms grammar: a grid of rectangular rooms joined by three-wide doors along a randomised spanning tree
 * (plus a loop at higher difficulty). The spawn room is empty; enemies scale with difficulty and depth;
 * the goal sits in the deepest room. Everything is a plain tilemap, so the runtime and the solver stay generic.
 */
export function generateRooms(params: LevelGenParams): LevelJson {
  const rng = new Rng(params.seed);
  const d = Math.max(0, Math.min(1, params.difficulty));
  const cols = Math.max(2, Math.min(5, Math.round(params['rooms'] ?? 2 + Math.round(d * 2))));
  const rows = 2;
  const rw = 12 + rng.int(4);
  const rh = 8 + rng.int(3);
  const cw = rw + 1;
  const ch = rh + 1;
  const width = cols * cw + 1;
  const height = rows * ch + 1;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('#'));
  const x0 = (c: number) => c * cw + 1;
  const y0 = (r: number) => r * ch + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (let y = y0(r); y < y0(r) + rh; y++) for (let x = x0(c); x < x0(c) + rw; x++) grid[y]![x] = '.';

  // Spanning tree by randomised depth-first walk; doors are 3-wide openings in the shared wall.
  const key = (c: number, r: number) => `${c},${r}`;
  const visited = new Set<string>([key(0, 0)]);
  const adj = new Map<string, Cell[]>();
  const carveDoor = (a: Cell, b: Cell) => {
    if (a.r === b.r) {
      const x = Math.max(a.c, b.c) * cw;
      const my = y0(a.r) + Math.floor(rh / 2);
      for (let y = my - 1; y <= my + 1; y++) grid[y]![x] = '.';
    } else {
      const y = Math.max(a.r, b.r) * ch;
      const mx = x0(a.c) + Math.floor(rw / 2);
      for (let x = mx - 1; x <= mx + 1; x++) grid[y]![x] = '.';
    }
    adj.set(key(a.c, a.r), [...(adj.get(key(a.c, a.r)) ?? []), b]);
    adj.set(key(b.c, b.r), [...(adj.get(key(b.c, b.r)) ?? []), a]);
  };
  const stack: Cell[] = [{ c: 0, r: 0 }];
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!;
    const options = [
      { c: cur.c + 1, r: cur.r },
      { c: cur.c - 1, r: cur.r },
      { c: cur.c, r: cur.r + 1 },
      { c: cur.c, r: cur.r - 1 },
    ].filter((n) => n.c >= 0 && n.c < cols && n.r >= 0 && n.r < rows && !visited.has(key(n.c, n.r)));
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const next = options[rng.int(options.length)]!;
    visited.add(key(next.c, next.r));
    carveDoor(cur, next);
    stack.push(next);
  }
  if (d > 0.5 && cols >= 2) {
    // One loop: join two horizontally adjacent rooms that are not yet connected.
    for (let tries = 0; tries < 8; tries++) {
      const c = rng.int(cols - 1);
      const r = rng.int(rows);
      const a = { c, r };
      const b = { c: c + 1, r };
      if (!(adj.get(key(a.c, a.r)) ?? []).some((n) => n.c === b.c && n.r === b.r)) {
        carveDoor(a, b);
        break;
      }
    }
  }

  // Depth from the spawn room over the room graph.
  const depth = new Map<string, number>([[key(0, 0), 0]]);
  const queue: Cell[] = [{ c: 0, r: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of adj.get(key(cur.c, cur.r)) ?? []) {
      if (depth.has(key(n.c, n.r))) continue;
      depth.set(key(n.c, n.r), (depth.get(key(cur.c, cur.r)) ?? 0) + 1);
      queue.push(n);
    }
  }
  let goalCell: Cell = { c: cols - 1, r: rows - 1 };
  let maxDepth = -1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((depth.get(key(c, r)) ?? 0) > maxDepth) { maxDepth = depth.get(key(c, r)) ?? 0; goalCell = { c, r }; }

  const centre = (cell: Cell) => ({ x: x0(cell.c) + Math.floor(rw / 2), y: y0(cell.r) + Math.floor(rh / 2) });
  const spawn = centre({ c: 0, r: 0 });
  const goal = centre(goalCell);
  grid[spawn.y]![spawn.x] = 'S';
  grid[goal.y]![goal.x] = 'G';

  const entities: LevelJson['entities'] = [];
  const taken = new Set<string>([key(spawn.x, spawn.y), key(goal.x, goal.y)]);
  const freeTile = (cell: Cell): { x: number; y: number } | null => {
    for (let tries = 0; tries < 30; tries++) {
      const x = x0(cell.c) + 1 + rng.int(rw - 2);
      const y = y0(cell.r) + 1 + rng.int(rh - 2);
      if (grid[y]![x] !== '.' || taken.has(key(x, y))) continue;
      // Keep the door lanes (middle row and column) free so paths never get blocked.
      if (Math.abs(x - (x0(cell.c) + Math.floor(rw / 2))) <= 1 && Math.abs(y - (y0(cell.r) + Math.floor(rh / 2))) <= 1) continue;
      taken.add(key(x, y));
      return { x, y };
    }
    return null;
  };
  // Hostiles on the floor are capped (the validator allows 24): deeper rooms are filled first.
  const enemyBudget = Math.round(5 + d * 15);
  let placed = 0;
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ c, r });
  cells.sort((a, b) => (depth.get(key(b.c, b.r)) ?? 0) - (depth.get(key(a.c, a.r)) ?? 0));
  for (const cell of cells) {
    {
      const { c, r } = cell;
      const dep = depth.get(key(c, r)) ?? 0;
      // Cover: one or two single solid tiles in the room's quadrants (never on the door lanes).
      if (d >= 0.35) {
        const corners = [
          { x: x0(c) + 2, y: y0(r) + 2 },
          { x: x0(c) + rw - 3, y: y0(r) + 2 },
          { x: x0(c) + 2, y: y0(r) + rh - 3 },
          { x: x0(c) + rw - 3, y: y0(r) + rh - 3 },
        ];
        const n = 1 + (d > 0.7 ? rng.int(2) : 0);
        for (let i = 0; i < n; i++) {
          const corner = corners[rng.int(corners.length)]!;
          if (grid[corner.y]![corner.x] === '.' && !taken.has(key(corner.x, corner.y))) {
            grid[corner.y]![corner.x] = '#';
            taken.add(key(corner.x, corner.y));
          }
        }
      }
      // Gems: one per room, two in the goal room.
      const gems = c === goalCell.c && r === goalCell.r ? 2 : 1;
      for (let i = 0; i < gems; i++) {
        const t = freeTile(cell);
        if (t) entities.push({ type: 'gem', x: t.x, y: t.y, props: {} });
      }
      if (dep === 0) continue;
      const count = Math.min(4, 1 + Math.round(d * 2) + (dep >= 2 ? 1 : 0), enemyBudget - placed);
      let archerHere = false;
      for (let i = 0; i < count; i++) {
        const t = freeTile(cell);
        if (!t) break;
        placed++;
        let type = 'grunt';
        if (i === count - 1 && d > 0.55 && dep === maxDepth && rng.chance(d)) type = 'brute';
        else if (i >= 1 && !archerHere && d > 0.3 && rng.chance(Math.min(0.8, d * 0.9))) {
          type = 'archer';
          archerHere = true;
        }
        entities.push({ type, x: t.x, y: t.y, props: {} });
      }
    }
  }
  return {
    version: 1,
    id: `rooms-${params.seed}`,
    name: `Rooms ${params.seed}`,
    tileSize: 8,
    width,
    height,
    legend: { '.': 'air', '#': 'solid', S: 'spawn', G: 'goal' },
    rows: grid.map((row) => row.join('')),
    entities,
    spawn,
    goal,
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}
