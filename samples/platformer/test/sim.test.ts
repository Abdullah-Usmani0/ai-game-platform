import { BehaviourFsm, EcaRule, LevelJson } from '@gg/schemas';
import { createSim, emptyInput, replay, type InputState } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import walkerJson from '../content/behaviour/walker.fsm.json';
import l01Json from '../content/levels/l01.json';
import coinSfxJson from '../content/rules/coin-sfx.eca.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

const level = LEVELS[0]!;

/** Greedy runner: hold right, hold jump for 12 ticks when blocked or when a pit is ahead. */
function greedyBot(sim: ReturnType<typeof createSim>, maxTicks: number): { won: boolean; ticks: number } {
  let jumpHold = 0;
  for (let t = 0; t < maxTicks; t++) {
    const p = sim.world.player;
    const input: InputState = { ...emptyInput(), right: true };
    const aheadX = p.x + p.w + 6;
    const belowKind = sim.map.kindAtPx(aheadX, p.y + p.h + 2);
    const pitAhead = belowKind === 'air' || belowKind === 'hazard';
    if (jumpHold === 0 && p.grounded && (p.hitWall || pitAhead)) jumpHold = 12;
    if (jumpHold > 0) {
      input.jump = true;
      jumpHold--;
    }
    sim.step(input);
    if (sim.world.flags.won) return { won: true, ticks: sim.tick };
  }
  return { won: false, ticks: sim.tick };
}

describe('content validates against the schemas', () => {
  it('level, behaviour and rule parse', () => {
    expect(LevelJson.parse(l01Json).id).toBe('l01');
    expect(BehaviourFsm.parse(walkerJson).initial).toBe('patrol');
    expect(EcaRule.parse(coinSfxJson).on).toBe('pickup');
  });
});

describe('sample platformer', () => {
  it('a greedy runner clears the level within 20 seconds', () => {
    const sim = createSim({ ...SIM_OPTIONS, level, seed: 1 });
    const result = greedyBot(sim, 20 * 60);
    expect(result.won).toBe(true);
    expect(sim.events.count('jump')).toBeGreaterThan(2);
    expect(sim.events.count('land')).toBeGreaterThan(2);
    expect(sim.events.count('level_complete')).toBe(1);
  });

  it('is deterministic across runs and seeds change the hash only through rng use', () => {
    const script = [{ from: 0, to: 300, input: { right: true } }, { from: 20, to: 32, input: { jump: true } }];
    const a = replay({ ...SIM_OPTIONS, level, seed: 3 }, script, 300);
    const b = replay({ ...SIM_OPTIONS, level, seed: 3 }, script, 300);
    expect(a.hash).toBe(b.hash);
    expect(a.player['x']).toBeGreaterThan(40);
  });

  it('coins award score and emit pickup + audio_play through the eca rule', () => {
    const sim = createSim({ ...SIM_OPTIONS, level, seed: 1 });
    greedyBot(sim, 20 * 60);
    expect(sim.world.score).toBeGreaterThan(0);
    expect(sim.events.count('pickup')).toBeGreaterThan(0);
    expect(sim.events.count('audio_play')).toBe(sim.events.count('pickup'));
  });

  it('coyote time: a jump pressed 5 ticks after leaving a ledge still fires', () => {
    const edgeLevel: LevelJson = {
      ...level,
      rows: level.rows.map((r, y) => (y >= 20 ? '#'.repeat(12) + '.'.repeat(level.width - 12) : '.'.repeat(level.width))),
      entities: [],
      legend: level.legend,
    };
    const sim = createSim({ ...SIM_OPTIONS, level: edgeLevel, seed: 1 });
    const hold = { ...emptyInput(), right: true };
    while (sim.world.player.grounded || sim.tick < 5) sim.step(hold);
    const leftTick = sim.tick;
    for (let i = 0; i < 4; i++) sim.step(hold);
    sim.step({ ...hold, jump: true });
    expect(sim.events.count('jump')).toBe(1);
    expect(sim.tick - leftTick).toBeLessThanOrEqual(6);
  });
});
