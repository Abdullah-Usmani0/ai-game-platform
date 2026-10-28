import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { topdownAction } from './node.js';

function simFor(seed: number, difficulty: number, simSeed = 1) {
  const level = topdownAction.levelGrammar.generate({ seed, difficulty });
  return createSim({
    level,
    feel: topdownAction.feelPresets[topdownAction.defaultFeel]!,
    seed: simSeed,
    systems: Object.values(topdownAction.systems).map((m) => m.create()),
    entityDefs: topdownAction.entityDefs,
    player: topdownAction.player,
    behaviours: topdownAction.defaultBehaviours,
    params: {},
    content: {},
    movementMode: 'topdown',
  });
}

describe('topdown-action template', () => {
  it('generates rooms the validator accepts across difficulties', () => {
    for (const difficulty of [0.1, 0.35, 0.6, 0.9]) {
      for (let seed = 1; seed <= 4; seed++) {
        const level = topdownAction.levelGrammar.generate({ seed, difficulty });
        const r = topdownAction.levelGrammar.validate(level, topdownAction.feelPresets['room-melee']!);
        expect(r.issues.filter((i) => i.severity === 'error'), `seed ${seed} d ${difficulty}`).toEqual([]);
        expect(r.metrics['enemies']).toBeGreaterThan(0);
      }
    }
    const hard = topdownAction.levelGrammar.generate({ seed: 3, difficulty: 0.9 });
    expect(hard.entities.some((e) => e.type === 'archer')).toBe(true);
  });

  it('the clearer wins easy floors with kills; the coward cannot pass the locked exit; afk never finishes', () => {
    let wins = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const win = runBot(simFor(seed, 0.2), topdownAction.bots['clearer']!, 90 * 60);
      if (!win.completed) continue;
      wins++;
      expect(win.events['hit']).toBeGreaterThan(0);
      expect(win.events['death']).toBeGreaterThan(0);
      const coward = runBot(simFor(seed, 0.2), topdownAction.bots['coward']!, 60 * 60);
      expect(coward.completed).toBe(false);
    }
    expect(wins, 'clearer wins on most easy seeds').toBeGreaterThanOrEqual(4);
    const afk = runBot(simFor(2, 0.5), topdownAction.bots['afk']!, 60 * 60);
    expect(afk.completed).toBe(false);
  });

  it('archers shoot arrows once the clearer engages them', () => {
    const level = topdownAction.levelGrammar.generate({ seed: 5, difficulty: 0.7 });
    expect(level.entities.some((e) => e.type === 'archer')).toBe(true);
    const r = runBot(simFor(5, 0.7), topdownAction.bots['clearer']!, 90 * 60);
    expect(r.events['spawn']).toBeGreaterThan(level.entities.length);
  });

  it('is deterministic under the chaos bot', () => {
    const a = runBot(simFor(9, 0.6), topdownAction.bots['chaos']!, 1500);
    const b = runBot(simFor(9, 0.6), topdownAction.bots['chaos']!, 1500);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
