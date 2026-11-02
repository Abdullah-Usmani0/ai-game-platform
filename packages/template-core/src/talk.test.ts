import type { DialogueFile, LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type InputState, type Sim, type SimOptions } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { readOn, runBot } from './bots.js';
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

/** Rings a bell at tick 120 (once the player has walked over): a menu with one answer, whose key may also be the talk's. */
const bell = defineSystem<{ rung: boolean }>({
  id: 'bell',
  init: () => ({ rung: false }),
  fixedUpdate(s, _input, ctx) {
    if (s.rung || ctx.tick < 120) return;
    s.rung = true;
    ctx.openMenu({ id: 'bell', title: 'A bell', options: [{ id: 'ok', label: 'Listen' }] });
  },
});

const optionsWith = (content: Record<string, unknown>, more: Partial<SimOptions> = {}): SimOptions => ({
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
  ...more,
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

describe('the talk key', () => {
  it("is the game's to choose: on another key, up opens nothing and that key opens the talk", () => {
    const sim = createSim(optionsWith({ dialogue: TALK }, { params: { talk: { key: 'action' } } }));
    walkTo(sim, 10 * 8 - 6);
    expect(talkTo(sim)).toBeNull();
    step(sim, { action: true });
    expect(sim.world.dialogue?.node).toBe('hello');
  });

  it('opens nothing on a key still held from a menu just closed: it takes a fresh press', () => {
    const sim = createSim(optionsWith({ dialogue: TALK }, { systems: [walker, talk, bell], params: { talk: { key: 'action' } } }));
    walkTo(sim, 10 * 8 - 6);
    for (let i = 0; i < 200 && !sim.world.menu; i++) step(sim);
    expect(sim.world.menu?.id).toBe('bell');
    // The answer is taken with action, held on after the menu closes: beside the keeper, and no talk opens.
    step(sim, {}, 20);
    step(sim, { action: true }, 10);
    expect([sim.world.menu ?? null, sim.world.dialogue ?? null]).toEqual([null, null]);
    // Let go and pressed again, it does.
    step(sim);
    step(sim, { action: true });
    expect(sim.world.dialogue?.node).toBe('hello');
  });

  it('a bot that opens a talk by chance reads on through it, and is never counted stuck while it reads', () => {
    const sim = createSim(optionsWith({ dialogue: TALK }));
    walkTo(sim, 10 * 8 - 6);
    // A bot that only ever taps up beside the keeper: each talk it opens, the runner reads to the end.
    const tapper = Object.assign((_s: Sim, tick: number) => ({ ...emptyInput(), up: tick % 3 === 0 }), {});
    const talks: string[] = [];
    sim.events.on('custom:talk', (ev) => talks.push(String(ev.payload['node'])));
    const r = runBot(sim, tapper, 400);
    expect(talks.slice(0, 2)).toEqual(['hello', 'again']);
    expect(r.stuckMaxTicks).toBeLessThan(60);
    // Reading presses action on alternate ticks once the grace is over, and nothing while no talk is open.
    expect(readOn(sim).action).toBe(sim.world.dialogue ? sim.tick % 2 === 0 && sim.tick - sim.world.dialogue.openedTick >= 18 : false);
  });
});
