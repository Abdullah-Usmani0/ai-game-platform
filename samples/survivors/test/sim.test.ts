import { BehaviourFsm, LevelJson, WaveTable } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS } from '@gg/template-survivors/node';
import { describe, expect, it } from 'vitest';
import arenaJson from '../content/arena.json';
import chaserJson from '../content/behaviour/chaser.fsm.json';
import wavesJson from '../content/waves.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('survivors sample', () => {
  it('content validates against the schemas', () => {
    expect(LevelJson.parse(arenaJson).legend['#']).toBe('solid');
    expect(WaveTable.parse(wavesJson).waves.length).toBeGreaterThan(5);
    expect(BehaviourFsm.parse(chaserJson).initial).toBe('chase');
  });
  it('the kiter survives the full minute and the afk player does not', () => {
    const kiter = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['kiter']!, 61 * 60);
    expect(kiter.completed).toBe(true);
    expect(kiter.events['pickup']).toBeGreaterThan(0);
    const afk = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['afk']!, 61 * 60);
    expect(afk.completed).toBe(false);
  });
  it('is deterministic', () => {
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), BOTS['chaos']!, 900);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), BOTS['chaos']!, 900);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
