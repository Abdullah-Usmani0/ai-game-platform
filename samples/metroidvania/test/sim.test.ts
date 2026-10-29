import { BehaviourFsm, LevelJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS, metroidvania, progression } from '@gg/template-metroidvania/node';
import { describe, expect, it } from 'vitest';
import walkerJson from '../content/behaviour/walker.fsm.json';
import levelJson from '../content/levels/L01-undervault.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('metroidvania sample', () => {
  it('content validates against the schemas and the explorer validator under every feel preset', () => {
    const level = LevelJson.parse(levelJson);
    expect(BehaviourFsm.parse(walkerJson).id).toBe('walker');
    for (const feel of Object.values(metroidvania.feelPresets)) expect(metroidvania.levelGrammar.validate(level, feel).ok, feel.id).toBe(true);
    expect(progression(level, metroidvania.feelPresets['celeste-class']!).steps.map((s) => s.type)).toEqual(['wings', 'key', 'door', 'boots']);
  });
  it('the seeker collects every relic and reaches the exit; the greedy walker cannot', () => {
    const seeker = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['seeker']!, 90 * 60);
    expect(seeker.completed).toBe(true);
    expect(seeker.events['pickup']).toBeGreaterThanOrEqual(3);
    expect(seeker.events['feedback']).toBeGreaterThan(0);
    const walker = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['walker']!, 60 * 60);
    expect(walker.completed).toBe(false);
  });
  it('is deterministic', () => {
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), BOTS['chaos']!, 900);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), BOTS['chaos']!, 900);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
