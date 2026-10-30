import type { BehaviourFsm, LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type Sim } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { MAP_PREFIX, roomAt, rooms } from './systems/rooms.js';
import { level } from './test-games.js';

/** Three rooms in a row, ten tiles each; a pacer starts in the second. */
function hall(): LevelJson {
  const rows = Array.from({ length: 8 }, (_, y) => Array.from({ length: 30 }, (_, x) => (y === 0 || y === 7 || x === 0 || x === 29 ? '#' : y === 6 && x === 2 ? 'S' : '.')).join(''));
  const l = level(rows);
  return {
    ...l,
    entities: [{ type: 'pacer', x: 15, y: 6, props: {} }],
    rooms: [
      { id: 'gate', x: 0, y: 0, w: 10, h: 8, kind: 'room' },
      { id: 'nave', x: 10, y: 0, w: 10, h: 8, kind: 'boss' },
      { id: 'altar', x: 20, y: 0, w: 10, h: 8, kind: 'save' },
    ],
  };
}

const pace: BehaviourFsm = {
  version: 1,
  id: 'pace',
  designNotes: '',
  initial: 'left',
  states: {
    left: { onEnter: [], update: [{ kind: 'patrol', speed: 30 }], transitions: [{ to: 'right', when: { kind: 'timer_elapsed', ms: 2000 } }] },
    right: { onEnter: [], update: [{ kind: 'patrol', speed: 30 }], transitions: [{ to: 'left', when: { kind: 'timer_elapsed', ms: 2000 } }] },
  },
};

/** Walks the player right at a steady pace, no gravity games. */
const stroll = defineSystem<null>({
  id: 'stroll',
  init: () => null,
  fixedUpdate(_s, input, ctx) {
    const p = ctx.world.player;
    p.vx = input.right ? 120 : input.left ? -120 : 0;
    ctx.move(p, p.vx * ctx.dt, 0);
  },
});

function sim(): Sim & { heard: Array<{ room: unknown; kind: unknown }> } {
  const s = createSim({ feel: CELESTE_CLASS, systems: [stroll, rooms], level: hall(), seed: 1, entityDefs: [{ type: 'pacer', w: 8, h: 8, hp: 2, fsm: 'pace', gravity: false }], behaviours: [pace], player: { w: 6, h: 8, hp: 3 } });
  const heard: Array<{ room: unknown; kind: unknown }> = [];
  s.events.on('custom:room_enter', (ev) => heard.push({ room: ev.payload['room'], kind: ev.payload['kind'] }));
  return Object.assign(s, { heard });
}
const walk = (s: Sim, ticks: number, right = true) => {
  for (let i = 0; i < ticks; i++) s.step({ ...emptyInput(), right, left: !right });
};

describe('rooms', () => {
  it('finds the room a tile is in', () => {
    const list = hall().rooms!;
    expect([roomAt(list, 3, 3), roomAt(list, 12, 3), roomAt(list, 29, 7), roomAt(list, 30, 3)]).toEqual([0, 1, 2, -1]);
  });

  it('keeps the enemies of the rooms the player is not in asleep, and wakes them as they walk in', () => {
    const s = sim();
    walk(s, 1);
    const pacer = s.world.entities.find((e) => e.type === 'pacer')!;
    expect(pacer.dormant).toBe(true);
    expect(s.world.hud['_room']).toBe('gate');
    const x = pacer.x;
    walk(s, 20);
    expect(s.world.hud['_room']).toBe('gate');
    expect(pacer.x).toBe(x);
    // Into the nave: the pacer wakes and walks.
    walk(s, 40);
    expect(s.world.hud['_room']).toBe('nave');
    expect(pacer.dormant).toBe(false);
    walk(s, 30, false);
    walk(s, 0);
    expect(pacer.x).not.toBe(x);
  });

  it('marks the rooms seen on the player, and announces each room entered', () => {
    const s = sim();
    walk(s, 1);
    expect(s.world.player.props[`${MAP_PREFIX}test`]).toBe('100');
    walk(s, 140);
    expect(s.world.player.props[`${MAP_PREFIX}test`]).toBe('111');
    expect(s.heard).toEqual([
      { room: 'gate', kind: 'room' },
      { room: 'nave', kind: 'boss' },
      { room: 'altar', kind: 'save' },
    ]);
    // Leaving puts the nave's pacer back to sleep.
    expect(s.world.entities.find((e) => e.type === 'pacer')!.dormant).toBe(true);
  });

  it('plays the same every time, and saves and loads its state', () => {
    const a = sim();
    const b = sim();
    walk(a, 90);
    walk(b, 45);
    const save = b.save();
    walk(b, 45);
    expect(b.hash()).toBe(a.hash());
    b.load(save);
    walk(b, 45);
    expect(b.hash()).toBe(a.hash());
  });
});
