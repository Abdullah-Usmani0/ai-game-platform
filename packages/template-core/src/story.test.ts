import type { DialogueFile, LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type Sim } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { story } from './systems/story.js';
import { level } from './test-games.js';

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
  const rows = Array.from({ length: 6 }, (_, y) => Array.from({ length: 20 }, (_, x) => (y === 0 || y === 5 || x === 0 || x === 19 ? '#' : y === 4 && x === 2 ? 'S' : '.')).join(''));
  return level(rows);
}

/** What happens, on cue: a rat falls at 2, the keeper's talk opens at 4, the warden falls at 30, the candle is lit at 40. */
const cues = (reloadAt = -1) =>
  defineSystem<null>({
    id: 'cues',
    init: () => null,
    fixedUpdate(_s, _input, ctx) {
      if (ctx.tick === 2) ctx.emit('death', { entity: 90, type: 'rat' });
      if (ctx.tick === 4) ctx.openDialogue('ask');
      if (ctx.tick === 30) ctx.emit('death', { entity: 91, type: 'warden' });
      if (ctx.tick === 40) ctx.emit('custom:light', {});
      if (ctx.tick === reloadAt) ctx.reloadFrom({ at: { x: 16, y: 32 }, props: { ...ctx.world.player.props }, removed: [], tiles: [] });
    },
  });
const make = (content: Record<string, unknown>, reloadAt = -1) => createSim({ feel: CELESTE_CLASS, systems: [cues(reloadAt), story], level: hall(), seed: 1, entityDefs: [], player: { w: 6, h: 8, hp: 3 }, movementMode: 'topdown', content });
/** Steps, pressing action now and then: the talk is read to its end. */
const play = (sim: Sim, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), action: i % 24 === 23 });
};

describe('story', () => {
  it('turns deeds into flags: a foe of the named type beaten, an event of the game', () => {
    const sim = make({ dialogue: STORY });
    play(sim, 35);
    const flags = () => Object.fromEntries(Object.entries(sim.world.player.props).filter(([k]) => k.startsWith('f:')));
    expect(flags()).toEqual({ 'f:asked': true, 'f:warden-down': true });
    play(sim, 10);
    expect(flags()).toEqual({ 'f:asked': true, 'f:warden-down': true, 'f:lit': true });
  });

  it('tells a quest as it begins and as it ends, once each, and plays the ending the flags reach', () => {
    const sim = make({ dialogue: STORY });
    const told: string[] = [];
    sim.events.on('custom:quest', (ev) => told.push(`${String(ev.payload['quest'])}:${String(ev.payload['state'])}:${String(ev.payload['title'])}`));
    play(sim, 60);
    expect(told).toEqual(['candle:on:The Candle', 'candle:done:The Candle']);
    expect(sim.world.player.props['q:candle']).toBe('done');
    expect(sim.end()).toMatchObject({ id: 'lit', quests: { done: 1, total: 1 } });
  });

  it('keeps where each quest stands through a reload: nothing is told again', () => {
    const sim = make({ dialogue: STORY }, 34);
    const told: string[] = [];
    sim.events.on('custom:quest', (ev) => told.push(`${String(ev.payload['quest'])}:${String(ev.payload['state'])}`));
    play(sim, 60);
    expect(sim.world.reloaded?.tick).toBe(34);
    expect(told).toEqual(['candle:on', 'candle:done']);
  });

  it('does nothing in a game with no story', () => {
    const sim = make({});
    play(sim, 60);
    expect(Object.keys(sim.world.player.props).filter((k) => k.startsWith('f:') || k.startsWith('q:'))).toEqual([]);
    expect(sim.end()).toBeNull();
  });
});
