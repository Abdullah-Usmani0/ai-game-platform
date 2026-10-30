import type { LevelJson } from '@gg/schemas';
import { createSim, emptyInput } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { autoRun, MAX_PACE, movement, runLevelLength, runSpeed } from './index.js';
import { platformer } from './node.js';

function simFor(level: ReturnType<typeof platformer.levelGrammar.generate>, seed = 1) {
  return createSim({
    level,
    feel: platformer.feelPresets[platformer.defaultFeel]!,
    seed,
    systems: Object.values(platformer.systems).map((m) => m.create()),
    entityDefs: platformer.entityDefs,
    player: platformer.player,
    behaviours: platformer.defaultBehaviours,
    movementMode: 'platformer',
  });
}

describe('platformer template', () => {
  it('generates levels the solver accepts and the walker bot completes, across seeds and difficulties', () => {
    let accepted = 0;
    let completed = 0;
    const total = 12;
    for (let i = 0; i < total; i++) {
      const level = platformer.levelGrammar.generate({ seed: 100 + i, difficulty: (i % 4) / 4 });
      const report = platformer.levelGrammar.validate(level, platformer.feelPresets[platformer.defaultFeel]!);
      if (!report.ok) continue;
      accepted++;
      const result = runBot(simFor(level), platformer.bots[platformer.solverBot]!, 60 * 60);
      if (result.completed) completed++;
    }
    expect(accepted).toBeGreaterThanOrEqual(total * 0.6);
    expect(completed).toBeGreaterThanOrEqual(Math.floor(accepted * 0.6));
  });

  it('chaos bot never crashes the sim and keeps the hash deterministic', () => {
    const level = platformer.levelGrammar.generate({ seed: 7, difficulty: 0.5 });
    const a = runBot(simFor(level, 3), platformer.bots['chaos']!, 1200);
    const b = runBot(simFor(level, 3), platformer.bots['chaos']!, 1200);
    expect(a.finalHash).toBe(b.finalHash);
  });

  it('exposes catalog metadata for every system', () => {
    for (const [id, mod] of Object.entries(platformer.systems)) {
      expect(mod.meta.id).toBe(id);
      expect(mod.meta.summary.length).toBeGreaterThan(10);
    }
  });
});

describe('auto-run', () => {
  const rows = ['........................................', '........................................', '.S......................................', '########################################'];
  const flat: LevelJson = { version: 1, id: 'l01', name: 'Flat', tileSize: 8, width: rows[0]!.length, height: rows.length, legend: { '.': 'air', '#': 'solid', S: 'air' }, rows, entities: [], spawn: { x: 1, y: 2 }, goal: { x: 38, y: 2 } };
  const feel = platformer.feelPresets[platformer.defaultFeel]!;
  const runner = (params: Record<string, number> = {}) =>
    createSim({ level: flat, feel, seed: 1, systems: [movement, autoRun], entityDefs: [], player: platformer.player, behaviours: [], params: { 'auto-run': params }, movementMode: 'platformer' });

  it('runs right on its own at its pace of the top speed, with the feel\'s acceleration, whatever left and right say', () => {
    const idle = runner();
    for (let i = 0; i < 60; i++) idle.step(emptyInput());
    expect(idle.world.player.vx).toBeCloseTo(feel.maxRun, 5);
    expect(idle.world.player.facing).toBe(1);
    const pushed = runner();
    for (let i = 0; i < 60; i++) pushed.step({ ...emptyInput(), left: true });
    expect(pushed.world.player.x).toBe(idle.world.player.x);
    // The first tick accelerates from rest, as a held arrow would.
    const first = runner();
    first.step(emptyInput());
    expect(first.world.player.vx).toBeLessThan(feel.maxRun);
    const fast = runner({ pace: 1.3 });
    for (let i = 0; i < 90; i++) fast.step(emptyInput());
    expect(fast.world.player.vx).toBeCloseTo(feel.maxRun * 1.3, 5);
  });

  it('speeds up by its ramp each minute, up to its cap, and gives levels the length it runs in a time', () => {
    expect(runSpeed({ pace: 1, rampPerMin: 0.3 }, feel, 3600)).toBeCloseTo(feel.maxRun * 1.3, 5);
    expect(runSpeed({ pace: 1.4, rampPerMin: 0.5 }, feel, 36_000)).toBeCloseTo(feel.maxRun * MAX_PACE, 5);
    expect(runLevelLength({}, feel, 18)).toBe(Math.round((18 * feel.maxRun) / 8));
    expect(runLevelLength({}, feel, 1)).toBe(48);
    expect(runLevelLength({}, feel, 600)).toBe(400);
  });

  it('jumps as the player says: a runner\'s jump carries its run', () => {
    const r = runner();
    for (let i = 0; i < 30; i++) r.step(emptyInput());
    r.step({ ...emptyInput(), jump: true });
    expect(r.world.player.vy).toBeLessThan(0);
    expect(r.world.player.vx).toBeGreaterThan(feel.maxRun);
  });
});
