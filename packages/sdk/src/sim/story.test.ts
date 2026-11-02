import type { DialogueFile, LevelJson } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { CELESTE_CLASS } from './feel.js';
import { emptyInput } from './input.js';
import { createSim, type Sim } from './sim.js';
import { defineSystem } from './system.js';

/** A keeper asks for the candle to be lit; the warden's fall and the lighting are deeds; two endings. */
const STORY: DialogueFile = {
  version: 1,
  names: { keeper: 'The Keeper' },
  nodes: [
    { id: 'ask', speaker: 'keeper', lines: ['Light the candle.'], choices: [], set: { asked: true } },
    { id: 'lit-end', speaker: 'narrator', lines: ['It burned on.'], choices: [] },
    { id: 'dark-end', speaker: 'narrator', lines: ['It stayed dark.'], choices: [] },
  ],
  starts: [{ speaker: 'keeper', node: 'ask' }],
  endings: [
    { id: 'lit', title: 'The Candle Lit', when: [{ flag: 'lit', is: true }], node: 'lit-end' },
    { id: 'dark', title: 'The Long Dark', node: 'dark-end' },
  ],
  quests: [{ id: 'candle', title: 'The Candle', start: [{ flag: 'asked', is: true }], done: [{ flag: 'lit', is: true }] }],
  deeds: [
    { on: 'death', type: 'warden', set: { 'warden-down': true } },
    { on: 'custom:light', set: { lit: true } },
  ],
};

function hall(): LevelJson {
  const rows = Array.from({ length: 6 }, (_, y) => Array.from({ length: 20 }, (_, x) => (y === 0 || y === 5 || x === 0 || x === 19 ? '#' : '.')).join(''));
  return { version: 1, id: 'hall', name: 'Hall', tileSize: 8, width: 20, height: 6, legend: { '.': 'air', '#': 'solid' }, rows, entities: [], spawn: { x: 2, y: 4 }, goal: { x: 2, y: 4 } };
}

interface Cues {
  /** The tick the level is won at, with the candle lit as it is (-1: never). */
  winAt?: number;
  /** Whether a heavy blow holds the world as the level is won. */
  hitstop?: boolean;
  /** The tick the level loads again from a save of the moment (-1: never). */
  reloadAt?: number;
}
/**
 * What happens, on cue: a rat falls at 2, the keeper's talk opens at 4, the warden falls at 30, the candle is lit at 40
 * (or as the level is won). A system with no ear for events: the sim keeps the story itself.
 */
const cues = ({ winAt = -1, hitstop = false, reloadAt = -1 }: Cues) =>
  defineSystem<null>({
    id: 'cues',
    init: () => null,
    fixedUpdate(_s, _input, ctx) {
      if (ctx.tick === 2) ctx.emit('death', { entity: 90, type: 'rat' });
      if (ctx.tick === 4) ctx.openDialogue('ask');
      if (ctx.tick === 30) ctx.emit('death', { entity: 91, type: 'warden' });
      if (ctx.tick === 40 && winAt < 0) ctx.emit('custom:light', {});
      if (ctx.tick === winAt) {
        ctx.emit('custom:light', {});
        ctx.world.flags.won = true;
        if (hitstop) ctx.world.hitstop = 8;
      }
      if (ctx.tick === reloadAt) ctx.reloadFrom({ at: { x: 16, y: 32 }, props: { ...ctx.world.player.props }, removed: [], tiles: [] });
    },
  });
const make = (content: Record<string, unknown>, c: Cues = {}) => createSim({ feel: CELESTE_CLASS, systems: [cues(c)], level: hall(), seed: 1, entityDefs: [], player: { w: 6, h: 8, hp: 3 }, movementMode: 'topdown', content });
/** Steps, pressing action now and then: the talk is read to its end. */
const play = (sim: Sim, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), action: i % 24 === 23 });
};
const told = (sim: Sim) => {
  const out: string[] = [];
  sim.events.on('custom:quest', (ev) => out.push(`${String(ev.payload['quest'])}:${String(ev.payload['state'])}@${ev.tick}`));
  return out;
};
const flags = (sim: Sim) => Object.fromEntries(Object.entries(sim.world.player.props).filter(([k]) => k.startsWith('f:')));

describe('the story the sim keeps', () => {
  it('turns deeds into flags, by the event and the type it names, with no system to hear them', () => {
    const sim = make({ dialogue: STORY });
    play(sim, 35);
    expect(flags(sim)).toEqual({ 'f:asked': true, 'f:warden-down': true });
    play(sim, 10);
    expect(flags(sim)).toEqual({ 'f:asked': true, 'f:warden-down': true, 'f:lit': true });
  });

  it('tells a quest as it begins and as it is done, once each, and the ending follows the flags', () => {
    const sim = make({ dialogue: STORY });
    const heard = told(sim);
    play(sim, 60);
    expect(heard.map((h) => h.split('@')[0])).toEqual(['candle:on', 'candle:done']);
    expect(heard[1]).toBe('candle:done@40');
    expect(sim.world.player.props['q:candle']).toBe('done');
    expect(sim.end()).toMatchObject({ id: 'lit', quests: { done: 1, total: 1 } });
  });

  it('tells a quest done on the winning step on that very tick, a heavy blow or not', () => {
    for (const hitstop of [false, true]) {
      const sim = make({ dialogue: STORY }, { winAt: 50, hitstop });
      const heard = told(sim);
      play(sim, 80);
      expect([sim.world.flags.won, heard.at(-1)]).toEqual([true, 'candle:done@50']);
    }
  });

  it('keeps where each quest stands through a reload and a save: nothing is told again, and a load plays on the same', () => {
    const sim = make({ dialogue: STORY }, { reloadAt: 34 });
    const heard = told(sim);
    play(sim, 33);
    const save = sim.save();
    play(sim, 27);
    expect(sim.world.reloaded?.tick).toBe(34);
    expect(heard.map((h) => h.split('@')[0])).toEqual(['candle:on', 'candle:done']);
    const end = sim.hash();
    sim.load(save);
    play(sim, 27);
    expect([sim.hash(), sim.world.player.props['q:candle']]).toEqual([end, 'done']);
  });

  it('keeps nothing in a game with no story', () => {
    const sim = make({});
    play(sim, 60);
    expect(Object.keys(sim.world.player.props).filter((k) => k.startsWith('f:') || k.startsWith('q:'))).toEqual([]);
    expect(sim.end()).toBeNull();
  });
});
