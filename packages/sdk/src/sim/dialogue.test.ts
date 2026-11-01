import type { DialogueFile, LevelJson } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { CELESTE_CLASS } from './feel.js';
import { emptyInput, type InputState } from './input.js';
import { DIALOGUE_CHARS_PER_TICK, MENU_GRACE_TICKS, createSim, type Sim } from './sim.js';
import { defineSystem } from './system.js';

/** The keeper greets the player, asks a question (a third answer only for one who knows the secret), and thanks them. */
const TALK: DialogueFile = {
  version: 1,
  names: { keeper: 'The Keeper' },
  nodes: [
    { id: 'hello', speaker: 'keeper', lines: ['You came back.', 'The bell is cracked.'], choices: [], next: 'ask' },
    {
      id: 'ask',
      speaker: 'keeper',
      lines: ['Will you ring it?'],
      choices: [
        { label: 'I will', to: 'yes', set: { agreed: true } },
        { label: 'Not yet', to: 'no' },
        { label: 'I know its name', to: 'yes', when: [{ flag: 'knows', is: true }] },
      ],
    },
    { id: 'yes', speaker: 'keeper', lines: ['Then go.'], choices: [], set: { thanked: true } },
    { id: 'no', speaker: 'keeper', lines: ['It will wait.'], choices: [] },
  ],
  starts: [{ speaker: 'keeper', node: 'hello' }],
};

function hall(): LevelJson {
  const rows = Array.from({ length: 8 }, (_, y) => Array.from({ length: 20 }, (_, x) => (y === 7 || x === 0 || x === 19 ? '#' : '.')).join(''));
  return { version: 1, id: 'hall', name: 'Hall', tileSize: 8, width: 20, height: 8, legend: { '.': 'air', '#': 'solid' }, rows, entities: [], spawn: { x: 3, y: 6 }, goal: { x: 3, y: 6 } };
}

/** A sim whose one system opens the talk at tick 2 and otherwise walks the player right while right is held. */
function talking(): Sim & { opened: () => boolean | undefined } {
  let opened: boolean | undefined;
  const driver = defineSystem<null>({
    id: 'driver',
    init: () => null,
    fixedUpdate(_s, input, ctx) {
      if (ctx.tick === 2) opened = ctx.openDialogue('hello');
      if (input.right) ctx.move(ctx.world.player, 1, 0);
    },
  });
  const sim = createSim({ feel: CELESTE_CLASS, systems: [driver], level: hall(), seed: 1, entityDefs: [], player: { w: 6, h: 8, hp: 3 }, content: { dialogue: TALK } });
  return Object.assign(sim, { opened: () => opened });
}
const step = (sim: Sim, input: Partial<InputState> = {}, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...input });
};
/** A press of action, released the next tick. */
const press = (sim: Sim) => {
  step(sim, { action: true });
  step(sim);
};
const names: string[] = [];

describe('dialogue', () => {
  it('opens at a node and holds the world still while the lines type out', () => {
    const sim = talking();
    const log: string[] = [];
    sim.events.on('*', (ev) => {
      if (ev.name === 'ui_open' || ev.name === 'custom:dialogue') log.push(`${ev.name}:${String(ev.payload['node'])}`);
    });
    step(sim, {}, 3);
    expect(sim.opened()).toBe(true);
    expect(sim.world.dialogue).toMatchObject({ node: 'hello', speaker: 'keeper', name: 'The Keeper', line: 0 });
    expect(log).toEqual(['ui_open:hello', 'custom:dialogue:hello']);
    // Held: the walk does nothing; the typewriter runs.
    const x = sim.world.player.x;
    step(sim, { right: true }, 4);
    expect(sim.world.player.x).toBe(x);
    expect(sim.world.dialogue!.shown).toBe(4 * DIALOGUE_CHARS_PER_TICK);
    expect(sim.snapshot()).toHaveProperty('dialogue');
  });

  it('shows a whole line on a press, goes on with the next, and asks: an answer sets its flags and leads on', () => {
    const sim = talking();
    step(sim, {}, 3);
    // A press in the first moments is ignored: a mashed key skips nothing unread.
    press(sim);
    expect(sim.world.dialogue!.shown).toBeLessThan('You came back.'.length + 1);
    step(sim, {}, MENU_GRACE_TICKS);
    // The line has typed out by now; the next press goes on to the second, which types out from its start.
    press(sim);
    expect([sim.world.dialogue!.line, sim.world.dialogue!.shown]).toEqual([1, DIALOGUE_CHARS_PER_TICK]);
    // The first press shows all of it, the second leads on to the next node.
    press(sim);
    expect(sim.world.dialogue!.shown).toBe('The bell is cracked.'.length);
    press(sim);
    expect(sim.world.dialogue!.node).toBe('ask');
    step(sim, {}, MENU_GRACE_TICKS);
    press(sim);
    press(sim);
    // Its answers, as a menu: the one for those who know the secret is left out.
    expect(sim.world.menu?.options.map((o) => o.label)).toEqual(['I will', 'Not yet']);
    step(sim, {}, MENU_GRACE_TICKS);
    press(sim);
    expect([sim.world.menu, sim.world.dialogue!.node, sim.world.player.props['f:agreed']]).toEqual([null, 'yes', true]);
    step(sim, {}, MENU_GRACE_TICKS);
    press(sim);
    press(sim);
    // Read to the end: its flags set, the talk over, the world going again.
    expect([sim.world.dialogue, sim.world.player.props['f:thanked']]).toEqual([null, true]);
    expect(sim.snapshot()).not.toHaveProperty('dialogue');
    const x = sim.world.player.x;
    step(sim, { right: true }, 3);
    expect(sim.world.player.x).toBeGreaterThan(x);
  });

  it('offers an answer once its flags hold, and opens no node the game does not have', () => {
    const sim = talking();
    sim.world.player.props['f:knows'] = true;
    step(sim, {}, 3 + MENU_GRACE_TICKS);
    for (let i = 0; i < 4; i++) press(sim);
    step(sim, {}, MENU_GRACE_TICKS);
    press(sim);
    press(sim);
    expect(sim.world.menu?.options.map((o) => o.label)).toEqual(['I will', 'Not yet', 'I know its name']);
    const none = createSim({ feel: CELESTE_CLASS, systems: [defineSystem<null>({ id: 'd', init: () => null, fixedUpdate: (_s, _i, ctx) => void names.push(String(ctx.openDialogue('nowhere'))) })], level: hall(), seed: 1, entityDefs: [], player: { w: 6, h: 8, hp: 3 }, content: { dialogue: TALK } });
    step(none);
    expect([names.at(-1), none.world.dialogue ?? null]).toEqual(['false', null]);
  });

  it('ends the story on the first ending its flags reach, and reads its epilogue as a talk', () => {
    const story: DialogueFile = {
      ...TALK,
      nodes: [...TALK.nodes, { id: 'bell-end', speaker: 'narrator', lines: ['The bell rang.'], choices: [] }, { id: 'quiet-end', speaker: 'narrator', lines: ['It never rang.'], choices: [] }],
      endings: [
        { id: 'rung', title: 'The Bell Rung', when: [{ flag: 'agreed', is: true }], node: 'bell-end' },
        { id: 'quiet', title: 'The Quiet Bell', node: 'quiet-end' },
      ],
      quests: [
        { id: 'ring', title: 'Ring the Bell', start: [{ flag: 'agreed', is: true }], done: [{ flag: 'thanked', is: true }] },
        { id: 'name', title: 'Its Name', start: [{ flag: 'knows', is: true }], done: [{ flag: 'named', is: true }] },
      ],
    };
    const make = (props: Record<string, boolean>) => {
      const sim = createSim({ feel: CELESTE_CLASS, systems: [], level: hall(), seed: 1, entityDefs: [], player: { w: 6, h: 8, hp: 3 }, content: { dialogue: story } });
      Object.assign(sim.world.player.props, props);
      return sim;
    };
    // Without endings a game just ends.
    const plain = createSim({ feel: CELESTE_CLASS, systems: [], level: hall(), seed: 1, entityDefs: [], player: { w: 6, h: 8, hp: 3 }, content: { dialogue: TALK } });
    expect([plain.end(), plain.world.dialogue ?? null, plain.snapshot()]).toEqual([null, null, expect.not.objectContaining({ ending: expect.anything() })]);
    expect(make({}).end()).toEqual({ id: 'quiet', title: 'The Quiet Bell', index: 2, count: 2, quests: { done: 0, total: 2 } });
    const sim = make({ 'f:agreed': true, 'f:thanked': true });
    const heard: string[] = [];
    sim.events.on('*', (ev) => {
      if (ev.name === 'custom:ending' || ev.name === 'ui_open') heard.push(`${ev.name}:${String(ev.payload['ending'] ?? ev.payload['node'])}`);
    });
    expect(sim.end()).toEqual({ id: 'rung', title: 'The Bell Rung', index: 1, count: 2, quests: { done: 1, total: 2 } });
    expect([heard, sim.world.dialogue?.node, sim.world.dialogue?.speaker, sim.snapshot().ending]).toEqual([['custom:ending:rung', 'ui_open:bell-end'], 'bell-end', 'narrator', 'rung']);
    // Ended once: the same ending again, nothing said twice.
    expect(sim.end()?.id).toBe('rung');
    expect(heard).toHaveLength(2);
    // The epilogue is read like any talk, and closes.
    step(sim, {}, MENU_GRACE_TICKS + 8);
    press(sim);
    expect(sim.world.dialogue ?? null).toBeNull();
    expect(sim.world.ending?.id).toBe('rung');
  });

  it('keeps a talk in the save: a sim loaded mid-line reads on exactly as before', () => {
    const sim = talking();
    step(sim, {}, 3 + MENU_GRACE_TICKS);
    const save = sim.save();
    press(sim);
    press(sim);
    step(sim, {}, 5);
    const end = sim.hash();
    sim.load(save);
    press(sim);
    press(sim);
    step(sim, {}, 5);
    expect(sim.hash()).toBe(end);
  });
});
