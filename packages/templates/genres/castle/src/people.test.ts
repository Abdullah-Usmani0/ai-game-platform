import { SystemsJson, type LevelJson } from '@gg/schemas';
import { createSim, emptyInput, type InputState, type Sim } from '@gg/sdk';
import { runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { castle, KEEPER_TYPE, HERMIT_TYPE } from './node.js';

const roomOf = (level: LevelJson, x: number, y: number) => (level.rooms ?? []).find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
/** The castle with the content every castle game ships: its moves and its people's talk. */
const options = (feel = castle.defaultFeel) => simOptionsFor(castle, SystemsJson.parse({ ...systemsJsonFor(castle), feelPreset: feel }), { behaviours: castle.defaultBehaviours, content: { ...castle.shippedContent } });
const step = (sim: Sim, input: Partial<InputState> = {}, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...input });
};
const tap = (sim: Sim, input: Partial<InputState>) => {
  step(sim, input);
  step(sim);
};
/** Reads the open talk until it asks or ends: past each node's grace, a press to show a line whole, one to go on. */
const read = (sim: Sim) => {
  for (let i = 0; i < 12 && sim.world.dialogue && !sim.world.menu; i++) {
    step(sim, {}, 20);
    tap(sim, { action: true });
  }
};

describe("the castle's people", () => {
  it('kneels a hermit by the start, and stands the candle-keeper in the second altar room, well clear of its altar', () => {
    for (const difficulty of [0.1, 0.3, 0.6]) {
      for (const seed of [1, 2]) {
        const level = castle.levelGrammar.generate({ seed, difficulty });
        const hermits = level.entities.filter((e) => e.type === HERMIT_TYPE);
        expect(hermits.map((p) => roomOf(level, p.x, p.y)?.id)).toEqual(['start']);
        const keepers = level.entities.filter((e) => e.type === KEEPER_TYPE);
        expect(keepers.map((k) => roomOf(level, k.x, k.y)?.id)).toEqual(difficulty >= 0.2 ? ['altar-2'] : []);
        const altar = level.entities.find((e) => e.type === 'altar' && roomOf(level, e.x, e.y)?.id === 'altar-2');
        for (const k of keepers) expect(Math.abs(k.x - altar!.x)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('talks: up beside the hermit opens his talk, an answer leads on and marks him met, and he greets the player again', () => {
    const level = castle.levelGrammar.generate({ seed: 1, difficulty: 0.3 });
    const hermit = level.entities.find((e) => e.type === HERMIT_TYPE)!;
    const sim = createSim({ ...options(), level, seed: 1, resume: { at: { x: (hermit.x + 1) * 16, y: (hermit.y + 1) * 16 - 42 }, props: {}, removed: [], tiles: [] } });
    const said: string[] = [];
    sim.events.on('custom:dialogue', (ev) => said.push(String(ev.payload['node'])));
    step(sim, {}, 4);
    tap(sim, { up: true });
    expect(sim.world.dialogue?.name).toBe('The Hermit');
    read(sim);
    // He asks: the second answer.
    expect(sim.world.menu?.options.map((o) => o.label)).toEqual(['Who are you?', 'What waits?']);
    step(sim, {}, 20);
    tap(sim, { right: true });
    tap(sim, { action: true });
    read(sim);
    expect([sim.world.dialogue ?? null, sim.world.player.props['f:met-hermit']]).toEqual([null, true]);
    tap(sim, { up: true });
    read(sim);
    expect(said).toEqual(['hermit-hello', 'hermit-wings', 'hermit-again']);
  });

  it('is passed by: the route bot rests at the altars and wins without a word, the people standing by', () => {
    const level = castle.levelGrammar.generate({ seed: 1, difficulty: 0.3 });
    const sim = createSim({ ...options(), level, seed: 1 });
    let talks = 0;
    sim.events.on('custom:talk', () => talks++);
    const r = runBot(sim, castle.bots['route']!, 60 * 180);
    expect([r.completed, talks]).toEqual([true, 0]);
  });
});
