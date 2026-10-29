import { BehaviourFsm, LevelJson, type ParamValue } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS } from '@gg/template-topdown-action/node';
import { describe, expect, it } from 'vitest';
import gruntJson from '../content/behaviour/grunt.fsm.json';
import wardenJson from '../content/behaviour/warden.fsm.json';
import l01 from '../content/levels/L01-ember-01.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('topdown-action sample', () => {
  it('content validates against the schemas', () => {
    expect(LevelJson.parse(l01).legend['G']).toBe('goal');
    expect(BehaviourFsm.parse(gruntJson).initial).toBe('wait');
    expect(BehaviourFsm.parse(wardenJson).states['roar']).toBeDefined();
  });

  it('the clearer finishes every floor on its own, the warden included; the coward cannot leave the first', () => {
    for (const level of LEVELS) {
      const r = runBot(createSim({ ...SIM_OPTIONS, level, seed: 1 }), BOTS['clearer']!, 90 * 60);
      expect(r.completed, `${level.id} not completed (ticks=${r.ticks} deaths=${r.deaths})`).toBe(true);
      expect(r.events['feedback']).toBeGreaterThan(0);
    }
    const lair = LEVELS[2]!;
    expect(lair.entities.filter((e) => e.type === 'warden')).toHaveLength(1);
    const sim = createSim({ ...SIM_OPTIONS, level: lair, seed: 1 });
    runBot(sim, BOTS['clearer']!, 90 * 60);
    expect(sim.events.history().some((e) => e.name === 'death' && e.payload['type'] === 'warden')).toBe(true);
    // No boon after the boss: the run is over.
    expect(sim.events.count('menu_open')).toBe(0);
    const coward = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 }), BOTS['coward']!, 60 * 60);
    expect(coward.completed).toBe(false);
  });

  it('a run takes a boon after each floor and carries it on, as the controller does', () => {
    let carry: Record<string, ParamValue> = {};
    const taken: string[] = [];
    for (const [i, level] of LEVELS.entries()) {
      const sim = createSim({ ...SIM_OPTIONS, level, seed: 1 + i, carry });
      const r = runBot(sim, BOTS['clearer']!, 90 * 60);
      expect(r.completed, `${level.id}`).toBe(true);
      for (const ev of sim.events.history()) if (ev.name === 'custom:boon') taken.push(String(ev.payload['boon']));
      carry = { ...sim.world.player.props };
    }
    expect(taken).toHaveLength(2);
    const stacks = Object.entries(carry).filter(([k]) => k.startsWith('boon_'));
    expect(stacks.reduce((n, [, v]) => n + Number(v), 0)).toBe(2);
  });

  it('is deterministic', () => {
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 2 }), BOTS['chaos']!, 900);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 2 }), BOTS['chaos']!, 900);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
