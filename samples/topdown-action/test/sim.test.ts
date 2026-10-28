import { BehaviourFsm, LevelJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS } from '@gg/template-topdown-action/node';
import { describe, expect, it } from 'vitest';
import gruntJson from '../content/behaviour/grunt.fsm.json';
import l01 from '../content/levels/L01-ember-01.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('topdown-action sample', () => {
  it('content validates against the schemas', () => {
    expect(LevelJson.parse(l01).legend['G']).toBe('goal');
    expect(BehaviourFsm.parse(gruntJson).initial).toBe('wait');
  });
  it('the clearer finishes both floors; the coward cannot leave the first', () => {
    for (const level of LEVELS) {
      const r = runBot(createSim({ ...SIM_OPTIONS, level, seed: 1 }), BOTS['clearer']!, 90 * 60);
      expect(r.completed, `${level.id} not completed (ticks=${r.ticks} deaths=${r.deaths})`).toBe(true);
      expect(r.events['feedback']).toBeGreaterThan(0);
    }
    const coward = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['coward']!, 60 * 60);
    expect(coward.completed).toBe(false);
  });
  it('is deterministic', () => {
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 2 }), BOTS['chaos']!, 900);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 2 }), BOTS['chaos']!, 900);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
