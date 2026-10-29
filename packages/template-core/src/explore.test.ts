import type { Sim } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { explore, explorerKeys, explorerOptionsFor, type ExploreOptions } from './explore.js';
import { board, platformer, room, survival } from './test-games.js';

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
});
