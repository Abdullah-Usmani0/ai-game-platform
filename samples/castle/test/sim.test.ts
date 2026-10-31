import { BehaviourFsm, LevelJson, LevelProof } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { levelTicksOf, runBot } from '@gg/template-core';
import { castle, world } from '@gg/template-castle/node';
import { describe, expect, it } from 'vitest';
import ghoulJson from '../content/behaviour/ghoul.fsm.json';
import proofJson from '../content/proofs/salt-chapel.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('castle sample', () => {
  it('content validates against the schemas and the world solver under both feels', () => {
    const level = LevelJson.parse(LEVELS[0]);
    expect(BehaviourFsm.parse(ghoulJson).id).toBe('ghoul');
    for (const feel of Object.values(castle.feelPresets)) expect(castle.levelGrammar.validate(level, feel).ok, feel.id).toBe(true);
    expect(world(level, castle.feelPresets[castle.defaultFeel]!).steps.map((s) => s.type)).toEqual(['wings', 'boots']);
  });

  it('the route bot takes both relics, rests at both altars and reaches the way out; the greedy walker cannot', () => {
    const sim = createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 });
    const route = runBot(sim, castle.bots['route']!, levelTicksOf(SIM_OPTIONS));
    expect(route.completed).toBe(true);
    expect(route.events['pickup']).toBeGreaterThanOrEqual(2);
    expect(sim.events.count('custom:rest')).toBe(2);
    expect(route.events['feedback']).toBeGreaterThan(0);
    const walker = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), castle.bots['walker']!, 60 * 60);
    expect(walker.completed).toBe(false);
  });

  it('its recorded run wins again, rests and all, and the game is deterministic', () => {
    const proof = LevelProof.parse(proofJson);
    const sim = createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: proof.seed });
    sim.run(proof.script, proof.ticks);
    expect(sim.world.flags.won).toBe(true);
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), castle.bots['chaos']!, 900);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 2 }), castle.bots['chaos']!, 900);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
