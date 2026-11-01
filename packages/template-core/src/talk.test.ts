import type { DialogueFile, LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type InputState, type Sim, type SimOptions } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { talk } from './systems/talk.js';
import { level } from './test-games.js';

/** A keeper who greets a stranger and knows a friend again; an abbot's acolyte who speaks for the abbot. */
const TALK: DialogueFile = {
  version: 1,
  names: { keeper: 'The Keeper', abbot: 'The Abbot' },
  nodes: [
    { id: 'hello', speaker: 'keeper', lines: ['A stranger.'], choices: [], set: { met: true } },
    { id: 'again', speaker: 'keeper', lines: ['You again.'], choices: [] },
    { id: 'abbot', speaker: 'abbot', lines: ['Kneel.'], choices: [] },
  ],
  starts: [
    { speaker: 'keeper', node: 'again', when: [{ flag: 'met', is: true }] },
    { speaker: 'keeper', node: 'hello' },
    { speaker: 'abbot', node: 'abbot' },
  ],
};

function corridor(): LevelJson {
  const rows = Array.from({ length: 6 }, (_, y) => Array.from({ length: 30 }, (_, x) => (y === 0 || y === 5 || x === 0 || x === 29 ? '#' : y === 4 && x === 2 ? 'S' : '.')).join(''));
  return { ...level(rows), entities: [{ type: 'keeper', x: 10, y: 4, props: {} }, { type: 'acolyte', x: 22, y: 4, props: { speaker: 'abbot' } }] };
}

/** Walks the player while left or right is held. */
const walker = defineSystem<null>({
  id: 'walker',
  init: () => null,
  fixedUpdate(_s, input, ctx) {
    const p = ctx.world.player;
    ctx.move(p, input.right ? 1.5 : input.left ? -1.5 : 0, 0);
  },
});

const optionsWith = (content: Record<string, unknown>): SimOptions => ({
  feel: CELESTE_CLASS,
  systems: [walker, talk],
  level: corridor(),
  seed: 1,
  entityDefs: [
    { type: 'keeper', w: 8, h: 8, gravity: false, npc: true },
    { type: 'acolyte', w: 8, h: 8, gravity: false, npc: true },
  ],
  player: { w: 6, h: 8, hp: 5 },
  content,
});
const step = (sim: Sim, input: Partial<InputState> = {}, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...input });
};
/** Up pressed and let go; then reads the talk to its end (action, past the grace each node has). */
const talkTo = (sim: Sim) => {
  step(sim, { up: true });
  step(sim);
  const node = sim.world.dialogue?.node ?? null;
  for (let i = 0; i < 6 && sim.world.dialogue; i++) {
    step(sim, {}, 20);
    step(sim, { action: true });
    step(sim);
  }
  return node;
};
/** Walks right until the player's middle is past `px`. */
const walkTo = (sim: Sim, px: number) => {
  for (let i = 0; i < 400 && sim.world.player.x + sim.world.player.w / 2 < px; i++) step(sim, { right: true });
};

describe('talk', () => {
  it("opens someone's first talk whose flags hold, beside them only, the two turned to each other", () => {
    const sim = createSim(optionsWith({ dialogue: TALK }));
    const talks: string[] = [];
    sim.events.on('custom:talk', (ev) => talks.push(String(ev.payload['node'])));
    // Up far from anyone does nothing.
    expect(talkTo(sim)).toBeNull();
    walkTo(sim, 10 * 8 - 6);
    const keeper = sim.world.entities.find((e) => e.type === 'keeper')!;
    expect(talkTo(sim)).toBe('hello');
    expect([sim.world.player.facing, keeper.facing, sim.world.player.props['f:met']]).toEqual([1, -1, true]);
    // Met: the keeper knows the player again.
    expect(talkTo(sim)).toBe('again');
    expect(talks).toEqual(['hello', 'again']);
  });

  it('lets someone speak as another (their speaker prop), and has nobody talk in a game with no dialogue', () => {
    const sim = createSim(optionsWith({ dialogue: TALK }));
    walkTo(sim, 22 * 8 - 6);
    expect(talkTo(sim)).toBe('abbot');
    expect(sim.world.dialogue ?? null).toBeNull();
    const mute = createSim(optionsWith({}));
    walkTo(mute, 10 * 8 - 6);
    expect(talkTo(mute)).toBeNull();
  });
});
