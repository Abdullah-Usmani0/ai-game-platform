import { LevelJson } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS, validatePuzzle } from '@gg/template-puzzle/node';
import { describe, expect, it } from 'vitest';
import l01 from '../content/levels/L01-cellar-01.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('puzzle sample', () => {
  it('content validates against the schemas and the solver; pushes ramp up', () => {
    expect(LevelJson.parse(l01).legend['#']).toBe('solid');
    const pushes = LEVELS.map((level) => {
      const r = validatePuzzle(level);
      expect(r.ok, `${level.id}: ${r.issues.map((i) => i.code).join(', ')}`).toBe(true);
      return Number(r.metrics['pushes']);
    });
    expect(pushes).toEqual([...pushes].sort((a, b) => a - b));
  });
  it('the solver bot finishes every board with feedback on each push; chaos does not', () => {
    for (const [i, level] of LEVELS.entries()) {
      const r = runBot(createSim({ ...SIM_OPTIONS, level, seed: levelSeed(DEFAULT_SEED, i) }), BOTS['solver']!, 60 * 60);
      expect(r.completed, `${level.id} not completed (ticks=${r.ticks})`).toBe(true);
      expect(r.events['feedback']).toBeGreaterThan(0);
    }
    const chaos = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[2]!, seed: 1 }), BOTS['chaos']!, 30 * 60);
    expect(chaos.completed).toBe(false);
  });
  it('is deterministic', () => {
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 2 }), BOTS['chaos']!, 900);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 2 }), BOTS['chaos']!, 900);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
