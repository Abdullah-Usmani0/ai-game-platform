import { createSim } from '@gg/sdk';
import { runBot, validateWaves } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { generateWaves } from './level/generate.js';
import { shmup } from './node.js';

function simFor(seed: number, difficulty: number, winAtS = 40) {
  const level = shmup.levelGrammar.generate({ seed: 1, difficulty });
  return createSim({
    level,
    feel: shmup.feelPresets[shmup.defaultFeel]!,
    seed,
    systems: Object.values(shmup.systems).map((m) => m.create()),
    entityDefs: shmup.entityDefs,
    player: shmup.player,
    behaviours: shmup.defaultBehaviours,
    params: { survival: { winAtS } },
    content: { waves: generateWaves({ seed: 1, difficulty }, winAtS) },
    movementMode: 'topdown',
  });
}

describe('shmup template', () => {
  it('the sky validates and the waves pass the pressure check', () => {
    const level = shmup.levelGrammar.generate({ seed: 3, difficulty: 0.5 });
    expect(shmup.levelGrammar.validate(level, shmup.feelPresets['arcade-ship']!).ok).toBe(true);
    const waves = generateWaves({ seed: 1, difficulty: 0.5 }, 60);
    expect(waves.waves.some((w) => w.spawns.some((s) => s.enemy === 'power'))).toBe(true);
    const r = validateWaves(waves, { drone: 2, tank: 6, power: 0 }, 4, 60);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('the dodger survives easy runs with kills; afk dies; the chaos bot is deterministic', () => {
    let wins = 0;
    for (const seed of [1, 2, 3, 4]) {
      const r = runBot(simFor(seed, 0.2), shmup.bots['dodger']!, 60 * 60);
      if (r.completed) wins++;
      expect(r.events['hit']).toBeGreaterThan(0);
    }
    expect(wins).toBeGreaterThanOrEqual(3);
    const afk = runBot(simFor(1, 0.6), shmup.bots['afk']!, 60 * 60);
    expect(afk.completed).toBe(false);
    const a = runBot(simFor(7, 0.5), shmup.bots['chaos']!, 1200);
    const b = runBot(simFor(7, 0.5), shmup.bots['chaos']!, 1200);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
