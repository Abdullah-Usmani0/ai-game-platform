import { CELESTE_CLASS, type Sim } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { explore, explorerKeys, explorerOptionsFor, subgoalsFrom, type ExploreOptions } from './explore.js';
import { suggestHints } from './level/hints.js';
import { base, board, finish, level, platformer, room, survival, walker } from './test-games.js';

/**
 * A maze whose way doubles back: the goal six tiles under the spawn as the crow flies, a hundred and fifty tiles away
 * by the way through. Closer to the goal is the wrong way at every turn.
 */
const MAZE = level([
  '##########################################',
  '#S.......................................#',
  '#........................................#',
  '####################################.....#',
  '####################################.....#',
  '#........................................#',
  '#........................................#',
  '#.....####################################',
  '#.....####################################',
  '#........................................#',
  '#........................................#',
  '####################################.....#',
  '####################################.....#',
  '#G.......................................#',
  '#........................................#',
  '##########################################',
]);
const maze = base(MAZE, [walker, finish], { movementMode: 'topdown' });

/** The proof holds: the script wins again on a fresh sim, in the reported number of ticks, and every segment of it holds. */
function provenOn(make: () => Sim, opts: ExploreOptions) {
  const r = explore(make, opts);
  expect(r.completed, JSON.stringify(r.best)).toBe(true);
  // A stored proof's segments each hold for a tick at least (the LevelProof schema): the explorer joins its cells' runs without empty ones.
  for (const seg of r.script!) expect(seg.to).toBeGreaterThan(seg.from);
  const again = make();
  again.run(r.script!, r.ticks);
  expect(again.world.flags.won).toBe(true);
  expect(r.explored).toBeLessThanOrEqual(opts.budget!);
  return r;
}

describe('explore', () => {
  it('jumps a pit of spikes', () => {
    provenOn(platformer, { budget: 20_000 });
  });

  it('finds the way round a wall in a top-down room', () => {
    provenOn(room, { budget: 20_000 });
  });

  it('survives five seconds of falling rocks, the runs that die going nowhere', () => {
    const r = provenOn(survival, { budget: 20_000 });
    expect(r.ticks).toBe(301);
  });

  it('answers a menu and pushes a crate one tap at a time', () => {
    const r = provenOn(board, { budget: 20_000, ...explorerOptionsFor([{ controls: { left: 'step', right: 'step', up: 'step', down: 'step' } }]) });
    // Taps: no arrow is ever held for more than two ticks.
    for (const seg of r.script!) if (seg.input.left || seg.input.right || seg.input.up || seg.input.down) expect(seg.to - seg.from).toBeLessThanOrEqual(2);
  });

  it('is deterministic: the same options find the same run', () => {
    expect(explore(room, { budget: 20_000, seed: 3 })).toEqual(explore(room, { budget: 20_000, seed: 3 }));
  });

  it('reports its most progressed moment when the budget runs out', () => {
    const r = explore(room, { budget: 120 });
    expect(r).toMatchObject({ completed: false, script: null, ticks: -1, explored: 120 });
    expect(r.best.progress).toBeGreaterThan(0);
    expect(r.best.progress).toBeLessThan(1);
    expect(r.best.goalDistance).toBeGreaterThan(0);
  });

  it('presses only the keys it is given: without jump the pit cannot be crossed', () => {
    expect(explore(platformer, { budget: 8_000, keys: ['left', 'right'] }).completed).toBe(false);
  });

  it('keeps the archive under its cap', () => {
    expect(explore(room, { budget: 6_000, maxCells: 30 }).cells).toBeLessThanOrEqual(30);
  });
});

describe('explorer options from system metadata', () => {
  it('leaves out the keys systems use to undo or restart, and taps for grid steppers', () => {
    const grid = [{ controls: { action: 'attack' } }, { controls: { left: 'step', up: 'step', action: 'undo', dash: 'restart' } }];
    expect(explorerKeys(grid)).toEqual(['left', 'right', 'up', 'down', 'jump']);
    expect(explorerOptionsFor(grid)).toEqual({ keys: ['left', 'right', 'up', 'down', 'jump'], taps: true });
    expect(explorerOptionsFor([{}, { controls: { action: 'attack' } }])).toEqual({ keys: ['left', 'right', 'up', 'down', 'jump', 'dash', 'action'], taps: false });
  });

  it('presses guard and item only for a game whose systems read them', () => {
    expect(explorerKeys([{ controls: { action: 'attack' } }])).not.toContain('guard');
    expect(explorerKeys([{ controls: { action: 'attack', guard: 'parry', item: 'drink a flask' } }])).toEqual(['left', 'right', 'up', 'down', 'jump', 'dash', 'action', 'guard', 'item']);
  });

  it('never presses a key a system takes over: a runner\'s left and right do nothing', () => {
    const runner = [{ controls: { left: 'run', right: 'run', jump: 'jump', dash: 'dash' } }, { controls: {}, takesOver: ['left', 'right'] }];
    expect(explorerKeys(runner)).toEqual(['up', 'down', 'jump', 'dash', 'action']);
  });
});

describe('hints', () => {
  it('suggests waypoints along the way the floor takes, the goal last; none for an arena held where it stands', () => {
    const hints = suggestHints(MAZE, { movementMode: 'topdown', feel: CELESTE_CLASS })!;
    expect(hints.steps.length).toBeLessThanOrEqual(12);
    expect(hints.steps.at(-1)).toEqual({ kind: 'reach', x: 1, y: 13, r: 1 });
    // Every place is open floor, and they go round the maze in order: right, back left, right again, then home.
    for (const s of hints.steps) if (s.kind === 'reach') expect(MAZE.rows[s.y]![s.x]).not.toBe('#');
    const rows = hints.steps.map((s) => (s.kind === 'reach' ? s.y : -1));
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(suggestHints(level(['######', '#....#', '#.SG.#', '#....#', '######', '######']), { movementMode: 'topdown', feel: CELESTE_CLASS })).toBeNull();
  });

  it('a place is reached by walking, not through a wall: right beside it on the wrong side is far away', () => {
    const [step] = subgoalsFrom([{ kind: 'reach', x: 10, y: 5, r: 1 }]);
    const sim = maze();
    const p = sim.world.player;
    // Tile (10, 2) is three tiles above (10, 5), with the wall between them; the walk round is some sixty tiles.
    p.x = 10 * 8;
    p.y = 2 * 8;
    expect(step!.done(sim)).toBe(false);
    expect(step!.closeness(sim)).toBeLessThan(0.3);
    p.y = 5 * 8;
    p.x = 11 * 8;
    expect(step!.done(sim)).toBe(true);
    expect(step!.closeness(sim)).toBe(1);
    const [hud] = subgoalsFrom([{ kind: 'hud_at_least', key: 'score', value: 40 }]);
    sim.world.score = 10;
    expect([hud!.done(sim), hud!.closeness(sim)]).toEqual([false, 0.25]);
  });

  it("finds the maze's way with its hints, where the game's own progress leads it astray", () => {
    const hints = suggestHints(MAZE, { movementMode: 'topdown', feel: CELESTE_CLASS })!;
    expect(explore(maze, { budget: 20_000 }).completed).toBe(false);
    const r = provenOn(maze, { budget: 20_000, subgoals: subgoalsFrom(hints.steps) });
    // About the walk itself: 150 tiles at a tile every eight ticks.
    expect(r.ticks).toBeLessThan(2400);
    // The same hints, the same run.
    expect(explore(maze, { budget: 20_000, subgoals: subgoalsFrom(hints.steps) }).script).toEqual(r.script);
    // Three searches, one of them spending its whole budget: a busy machine takes longer than vitest's 5 s default.
  }, 60_000);

  it('reports how many steps the best moment had done when the budget runs out', () => {
    const hints = suggestHints(MAZE, { movementMode: 'topdown', feel: CELESTE_CLASS })!;
    const r = explore(maze, { budget: 1500, subgoals: subgoalsFrom(hints.steps) });
    expect(r.completed).toBe(false);
    expect(r.best.stage).toBeGreaterThan(0);
    expect(r.best.stage).toBeLessThan(hints.steps.length);
    expect(explore(maze, { budget: 1500 }).best.stage).toBeUndefined();
  });
});
