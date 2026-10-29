import type { LevelJson, SystemsJson } from '@gg/schemas';
import { createSim, emptyInput, type InputState } from '@gg/sdk';
import { runBot, simOptionsFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { boardFromSim, BOTS } from './bots.js';
import { puzzleRuntime } from './index.js';
import { cratesFor, generatePuzzle } from './level/generate.js';
import { validatePuzzle } from './level/validate.js';
import { boardFromLevel, liveCells, solve, tileOf } from './puzzle.js';

/**
 * A level from Sokoban notation: # wall, space floor, @ player, $ crate, . target, * crate on a target, + player on
 * a target. Boards smaller than the level minimum (8 x 6) are padded with wall.
 */
function board(art: string): LevelJson {
  const lines = art.split('\n').filter((l) => l.length > 0);
  const width = Math.max(8, ...lines.map((l) => l.length));
  const height = Math.max(6, lines.length);
  const rows: string[] = [];
  const entities: LevelJson['entities'] = [];
  let spawn = { x: 0, y: 0 };
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const ch = lines[y]?.[x] ?? '#';
      row += ch === '#' ? '#' : '.';
      if (ch === '@' || ch === '+') spawn = { x, y };
      if (ch === '.' || ch === '*' || ch === '+') entities.push({ type: 'target', x, y, props: {} });
      if (ch === '$' || ch === '*') entities.push({ type: 'crate', x, y, props: {} });
    }
    rows.push(row);
  }
  return { version: 1, id: 'test', name: 'Test', tileSize: 16, width, height, legend: { '#': 'solid', '.': 'air' }, rows, entities, spawn, goal: entities.find((e) => e.type === 'target') ?? spawn };
}

const SYSTEMS: SystemsJson = { version: 1, genre: 'puzzle', feelPreset: 'grid-snappy', systems: [{ id: 'grid-push', params: {} }] };
const simOf = (level: LevelJson, systems: SystemsJson = SYSTEMS) => createSim({ ...simOptionsFor(puzzleRuntime, systems), level, seed: 1 });

/** Step the sim with one input for a tick, then nothing until the slide has finished. */
function press(sim: ReturnType<typeof simOf>, key: keyof InputState, settle = 10): void {
  sim.step({ ...emptyInput(), [key]: true });
  for (let i = 0; i < settle; i++) sim.step(emptyInput());
}

const CORRIDOR = `
#########
#@ $   .#
#########`;

const ORDER = `
########
#      #
# $$ @ #
#  ..  #
#      #
########`;

describe('solver', () => {
  it('finds the fewest pushes and a move list that walks to each push', () => {
    const r = solve(boardFromLevel(board(CORRIDOR)));
    expect(r.status).toBe('solved');
    if (r.status !== 'solved') return;
    expect(r.solution.pushes).toBe(4);
    expect(r.solution.moves).toEqual(['right', 'right', 'right', 'right', 'right']);
  });

  it('marks corners off target dead and stops at the search budget', () => {
    const b = boardFromLevel(board(`
######
#@  .#
#   $#
######`));
    const live = liveCells(b);
    const corner = b.crates[0]!;
    expect(live[corner]).toBe(0);
    expect(solve(b).status).toBe('unsolvable');
    expect(solve(boardFromLevel(board(ORDER)), { maxStates: 2 }).status).toBe('budget');
  });

  it('solves a two-crate board where order matters', () => {
    const r = solve(boardFromLevel(board(ORDER)));
    expect(r.status).toBe('solved');
    // Each crate needs two pushes (one across, one down); pushing either straight down first strands the other.
    if (r.status === 'solved') expect(r.solution.pushes).toBe(4);
  });
});

describe('validatePuzzle', () => {
  const codes = (art: string) => validatePuzzle(board(art)).issues.map((i) => i.code);
  it('rejects malformed, stuck, solved and unsolvable boards with a precise code', () => {
    expect(codes(`
#######
#@    #
#######`)).toContain('no_crates');
    expect(codes(`
#######
#@ $  #
#######`)).toContain('crate_target_mismatch');
    expect(codes(`
#######
#@ * .#
#######`)).toContain('crate_target_mismatch');
    expect(codes(`
#######
#@ *  #
#######`)).toContain('already_solved');
    expect(codes(`
######
#@  .#
#   $#
######`)).toContain('dead_start');
    // Two crates nose to tail in a one-wide corridor: each cell is live on its own, but the front crate blocks the back one.
    expect(codes(`
#######
#@$$..#
#######`)).toContain('unsolvable');
    const ok = validatePuzzle(board(CORRIDOR));
    expect(ok.ok).toBe(true);
    expect(ok.metrics).toMatchObject({ pushes: 4, moves: 5, crates: 1 });
  });

  it('flags a crate outside the floor and two crates on one tile', () => {
    const lvl = board(CORRIDOR);
    const inWall = { ...lvl, entities: [...lvl.entities.filter((e) => e.type !== 'crate'), { type: 'crate', x: 0, y: 1, props: {} }] };
    expect(validatePuzzle(inWall).issues.map((i) => i.code)).toContain('blocked_cell');
    const twice = { ...lvl, entities: [...lvl.entities, { type: 'crate', x: 3, y: 1, props: {} }, { type: 'target', x: 5, y: 1, props: {} }] };
    expect(validatePuzzle(twice).issues.map((i) => i.code)).toContain('overlap');
  });
});

describe('generatePuzzle', () => {
  it('generates solvable boards for every difficulty, ramping crates and pushes, the same for the same seed', () => {
    const rows: Array<{ d: number; pushes: number }> = [];
    for (const d of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      for (const seed of [1, 2, 3, 4]) {
        const level = generatePuzzle({ seed, difficulty: d });
        const r = validatePuzzle(level);
        expect(r.ok, `seed ${seed} difficulty ${d}: ${r.issues.map((i) => i.code).join(', ')}`).toBe(true);
        expect(level.entities.filter((e) => e.type === 'crate')).toHaveLength(cratesFor(d));
        rows.push({ d, pushes: Number(r.metrics['pushes']) });
      }
    }
    const mean = (d: number) => rows.filter((r) => r.d === d).reduce((n, r) => n + r.pushes, 0) / 4;
    expect(mean(1)).toBeGreaterThan(mean(0) + 4);
    expect(generatePuzzle({ seed: 9, difficulty: 0.5 })).toEqual(generatePuzzle({ seed: 9, difficulty: 0.5 }));
  });
});

describe('grid-push system', () => {
  it('steps, bumps into walls, pushes, repeats a held key, and completes when every target holds a crate', () => {
    const sim = simOf(board(CORRIDOR));
    const tile = () => tileOf(boardFromSim(sim), boardFromSim(sim).player);
    press(sim, 'left');
    expect(sim.events.count('custom:bump')).toBe(1);
    expect(sim.world.hud['moves']).toBe(0);
    press(sim, 'right');
    expect(tile()).toEqual({ x: 2, y: 1 });
    expect(sim.events.count('move')).toBe(1);
    // Holding right: a step now, then repeats after the delay until the crate reaches the target.
    for (let i = 0; i < 90 && !sim.world.flags.won; i++) sim.step({ ...emptyInput(), right: true });
    expect(sim.world.flags.won).toBe(true);
    expect(sim.world.hud).toMatchObject({ moves: 5, pushes: 4, placed: '1/1' });
    expect(sim.events.count('push')).toBe(4);
    expect(sim.events.count('level_complete')).toBe(1);
  });

  it('undoes the last move and restarts the board', () => {
    const sim = simOf(board(CORRIDOR));
    const crateX = () => tileOf(boardFromSim(sim), boardFromSim(sim).crates[0]!).x;
    press(sim, 'right');
    press(sim, 'right');
    expect(crateX()).toBe(4);
    press(sim, 'action');
    expect(crateX()).toBe(3);
    expect(sim.world.hud).toMatchObject({ moves: 1, pushes: 0 });
    press(sim, 'right');
    press(sim, 'right');
    press(sim, 'dash');
    expect(crateX()).toBe(3);
    expect(sim.world.hud).toMatchObject({ moves: 0, pushes: 0 });
    expect(sim.events.count('undo')).toBe(2);
  });
});

describe('bots', () => {
  it('the solver bot completes generated boards; chaos runs clean; replays are deterministic', () => {
    for (const [seed, d] of [
      [1, 0.1],
      [2, 0.4],
      [3, 0.7],
      [4, 1],
    ] as const) {
      const level = generatePuzzle({ seed, difficulty: d });
      const run = runBot(simOf(level), BOTS['solver']!, 60 * 60);
      expect(run.completed, `seed ${seed} difficulty ${d}`).toBe(true);
      const again = runBot(simOf(level), BOTS['solver']!, 60 * 60);
      expect(again.finalHash).toBe(run.finalHash);
      const chaos = runBot(simOf(level), BOTS['chaos']!, 20 * 60);
      expect(chaos.ticks).toBeGreaterThan(0);
    }
  });
});
