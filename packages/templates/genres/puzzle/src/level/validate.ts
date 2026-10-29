import type { LevelJson } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from '@gg/validators';
import { boardFromLevel, CRATE_TYPE, isSolved, liveCells, region, solve, TARGET_TYPE, tileOf, type Board } from '../puzzle.js';

/** Search budget of the static check (positions expanded); generated levels stay far below it. */
export const SOLVE_BUDGET = 150_000;
/** A solution this short is a warm-up, not a puzzle. */
const TRIVIAL_PUSHES = 2;

/**
 * The puzzle validator is the solver: the board must be well formed (as many crates as targets, nothing in a wall or
 * stacked, the player not boxed in) and a push-optimal search within the budget must solve it. Metrics carry the
 * solution's pushes and moves, which the generator and the LEVELS stage use as the difficulty measure.
 */
export function validatePuzzle(level: LevelJson, opts: { budget?: number } = {}): ValidationReport {
  const issues: Issue[] = [];
  const b = boardFromLevel(level);
  const at = (cell: number) => tileOf(b, cell);
  const crates = level.entities.filter((e) => e.type === CRATE_TYPE);
  const targets = level.entities.filter((e) => e.type === TARGET_TYPE);
  if (crates.length === 0) issues.push(err('no_crates', 'the level has no crates to push'));
  if (crates.length !== targets.length) issues.push(err('crate_target_mismatch', `${crates.length} crate(s) but ${targets.length} target(s); every crate needs a target`));
  const inLevel = (t: { x: number; y: number }) => t.x >= 0 && t.y >= 0 && t.x < level.width && t.y < level.height;
  for (const [what, list] of [
    ['crate', crates],
    ['target', targets],
    ['player', [level.spawn]],
  ] as const) {
    for (const t of list) {
      if (!inLevel(t) || b.walls[t.x + 1 + (t.y + 1) * b.width]) issues.push(err('blocked_cell', `${what} at ${t.x},${t.y} is not on floor`, { x: t.x, y: t.y }));
    }
  }
  const stacked = (list: ReadonlyArray<{ x: number; y: number }>) => list.length !== new Set(list.map((t) => `${t.x},${t.y}`)).size;
  if (stacked(crates)) issues.push(err('overlap', 'two crates share a tile'));
  if (stacked(targets)) issues.push(err('overlap', 'two targets share a tile'));
  if (crates.some((c) => c.x === level.spawn.x && c.y === level.spawn.y)) issues.push(err('overlap', 'the player starts on a crate'));
  if (issues.some((i) => i.severity === 'error')) return report(issues, { crates: crates.length, targets: targets.length });

  if (isSolved(b)) issues.push(err('already_solved', 'every crate starts on a target'));
  if (touchesEdge(b, level)) issues.push(warn('open_edge', 'the floor the player can reach touches the level edge; the edge acts as a wall, but the board looks unfinished'));
  const live = liveCells(b);
  const dead = b.crates.filter((c) => !live[c]);
  for (const c of dead) issues.push(err('dead_start', `the crate at ${at(c).x},${at(c).y} can never reach a target`, at(c)));
  if (issues.some((i) => i.severity === 'error')) return report(issues, { crates: crates.length, targets: targets.length });

  const result = solve(b, { maxStates: opts.budget ?? SOLVE_BUDGET });
  if (result.status === 'unsolvable') {
    issues.push(err('unsolvable', `no sequence of pushes solves the board (${result.explored} positions searched)`));
    return report(issues, { crates: crates.length, explored: result.explored });
  }
  if (result.status === 'budget') {
    issues.push(err('search_budget', `the solver gave up after ${result.explored} positions; simplify the board so it can be checked`));
    return report(issues, { crates: crates.length, explored: result.explored });
  }
  const { pushes, moves, explored } = result.solution;
  if (pushes <= TRIVIAL_PUSHES) issues.push(warn('trivial', `solved in ${pushes} push(es); a warm-up at most`));
  const onTarget = b.crates.filter((c) => b.targets.includes(c)).length;
  return report(issues, { crates: crates.length, pushes, moves: moves.length, explored, startOnTarget: onTarget });
}

function touchesEdge(b: Board, level: LevelJson): boolean {
  for (const c of region(b)) {
    const t = tileOf(b, c);
    if (t.x === 0 || t.y === 0 || t.x === level.width - 1 || t.y === level.height - 1) return true;
  }
  return false;
}
