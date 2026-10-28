import { BehaviourFsm, LevelJson, WaveTable } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS } from '@gg/template-shmup/node';
import { describe, expect, it } from 'vitest';
import droneJson from '../content/behaviour/drone.fsm.json';
import skyJson from '../content/levels/L01-sky.json';
import wavesJson from '../content/waves.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('shmup sample', () => {
  it('content validates against the schemas', () => {
    expect(LevelJson.parse(skyJson).legend['#']).toBe('solid');
    expect(WaveTable.parse(wavesJson).waves.length).toBeGreaterThan(5);
    expect(BehaviourFsm.parse(droneJson).initial).toBe('dive');
  });
  it('the dodger survives the minute with kills and the afk ship does not', () => {
    const dodger = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['dodger']!, 61 * 60);
    expect(dodger.completed).toBe(true);
    expect(dodger.events['death']).toBeGreaterThan(3);
    expect(dodger.events['feedback']).toBeGreaterThan(0);
    const afk = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['afk']!, 61 * 60);
    expect(afk.completed).toBe(false);
  });
  it('is deterministic', () => {
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), BOTS['chaos']!, 900);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), BOTS['chaos']!, 900);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
