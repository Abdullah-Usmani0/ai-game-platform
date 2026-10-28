import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { generateWaves } from './level/generate.js';
import { validateWaves } from './level/validate.js';
import { survivors } from './node.js';

function simFor(seed: number, difficulty: number, winAtS = 40) {
  const level = survivors.levelGrammar.generate({ seed, difficulty });
  return createSim({
    level,
    feel: survivors.feelPresets[survivors.defaultFeel]!,
    seed,
    systems: Object.values(survivors.systems).map((m) => m.create()),
    entityDefs: survivors.entityDefs,
    player: survivors.player,
    behaviours: survivors.defaultBehaviours,
    params: { survival: { winAtS } },
    content: { waves: generateWaves({ seed, difficulty }, winAtS) },
    movementMode: 'topdown',
  });
}

describe('survivors template', () => {
  it('arena validates and waves pass the pressure check', () => {
    const level = survivors.levelGrammar.generate({ seed: 5, difficulty: 0.5 });
    expect(survivors.levelGrammar.validate(level, survivors.feelPresets['arena-melee']!).ok).toBe(true);
    const waves = generateWaves({ seed: 5, difficulty: 0.5 }, 60);
    const r = validateWaves(waves, { chaser: 2, brute: 6 }, 2, 60);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('an afk player dies (pressure exists); a kiter survives a 40 s easy run and wins', () => {
    const afk = runBot(simFor(3, 0.5), survivors.bots['afk']!, 60 * 60);
    expect(afk.completed).toBe(false);
    expect(afk.deaths).toBeGreaterThanOrEqual(1);
    const kiter = runBot(simFor(3, 0.15), survivors.bots['kiter']!, 60 * 60);
    expect(kiter.completed).toBe(true);
    expect(kiter.events['hit']).toBeGreaterThan(0);
    expect(kiter.events['pickup']).toBeGreaterThan(0);
  });

  it('is deterministic under the chaos bot', () => {
    const a = runBot(simFor(9, 0.6), survivors.bots['chaos']!, 1500);
    const b = runBot(simFor(9, 0.6), survivors.bots['chaos']!, 1500);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
