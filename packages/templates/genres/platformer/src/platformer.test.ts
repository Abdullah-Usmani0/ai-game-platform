import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
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
