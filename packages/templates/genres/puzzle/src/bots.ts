import { emptyInput, type Entity, type Sim } from '@gg/sdk';
import type { BotPolicy } from '@gg/template-core';
import { applyMove, boardKey, CRATE_TYPE, makeBoard, solve, TARGET_TYPE, type Board, type Dir } from './puzzle.js';

const FLOOR = new Set(['air', 'spawn', 'goal']);

function tileOf(e: Entity, ts: number): { x: number; y: number } {
  return { x: Math.floor((e.x + e.w / 2) / ts), y: Math.floor((e.y + e.h / 2) / ts) };
}

/** The board as the sim has it now (crates where their entities stand). */
export function boardFromSim(sim: Sim): Board {
  const ts = sim.map.tileSize;
  const isFloor = (tx: number, ty: number) => ty >= 0 && FLOOR.has(sim.map.kindAt(tx, ty));
  return makeBoard(
    sim.map.width,
    sim.map.height,
    isFloor,
    sim.world.entities.filter((e) => e.type === CRATE_TYPE).map((e) => tileOf(e, ts)),
    sim.world.entities.filter((e) => e.type === TARGET_TYPE).map((e) => tileOf(e, ts)),
    tileOf(sim.world.player, ts),
  );
}

/** At rest: the player centred on its tile (no slide in progress). */
function atRest(sim: Sim): boolean {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const t = tileOf(p, ts);
  return Math.abs(p.x - (t.x * ts + (ts - p.w) / 2)) < 0.01 && Math.abs(p.y - (t.y * ts + (ts - p.h) / 2)) < 0.01;
}

interface Plan {
  moves: Dir[];
  /** keys[i]: the board key expected before moves[i]. */
  keys: string[];
  next: number;
}

/** The solver's plan per sim, re-made when the board is not where the plan expects it. */
const plans = new WeakMap<Sim, Plan>();

function makePlan(b: Board): Plan | null {
  const r = solve(b);
  if (r.status !== 'solved') return null;
  const keys: string[] = [];
  let cur: Board | null = b;
  for (const d of r.solution.moves) {
    if (!cur) return null;
    keys.push(boardKey(cur));
    cur = applyMove(cur, d);
  }
  return { moves: r.solution.moves, keys, next: 0 };
}

/**
 * Solver: plans the fewest-push solution with the same search the validator runs and plays it one press per step
 * (a single-tick press, so every step is a fresh one), waiting for each slide to finish. Re-plans when the board
 * differs from the plan (a missed press, an undo) and gives up after too many re-plans.
 */
export const solver: BotPolicy = (sim, tick, mem) => {
  const input = emptyInput();
  if ((mem['pressedAt'] ?? -1) === tick - 1 || !atRest(sim)) return input;
  const board = boardFromSim(sim);
  const key = boardKey(board);
  let plan = plans.get(sim);
  if (!plan || plan.keys[plan.next] !== key) {
    // A step that never started (no slide within 30 ticks of the press) or a board off the plan: plan afresh.
    if (plan && (mem['replans'] ?? 0) > 40) return input;
    mem['replans'] = (mem['replans'] ?? 0) + (plan ? 1 : 0);
    const fresh = makePlan(board);
    if (!fresh) return input;
    plans.set(sim, fresh);
    plan = fresh;
  }
  const d = plan.moves[plan.next];
  if (!d) return input;
  if ((mem['waitUntil'] ?? 0) > tick) return input;
  input[d] = true;
  plan.next++;
  mem['pressedAt'] = tick;
  mem['waitUntil'] = tick + 2;
  return input;
};

/** Chaos: a seeded stream of steps with the occasional undo and restart; for crash and determinism checks. */
export const chaos: BotPolicy = (_sim, tick, mem) => {
  const input = emptyInput();
  if (tick % 7 !== 0) return input;
  const r = ((tick * 2654435761) >>> 0) % 100;
  mem['n'] = (mem['n'] ?? 0) + 1;
  if (r < 4) input.dash = true;
  else if (r < 14) input.action = true;
  else input[(['up', 'down', 'left', 'right'] as const)[r % 4]!] = true;
  return input;
};

export const BOTS: Record<string, BotPolicy> = { solver, chaos };
