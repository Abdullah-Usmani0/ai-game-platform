import type { LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type ProgressSave, type Sim, type SimOptions } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { pickups } from './systems/pickups.js';
import { rest } from './systems/rest.js';
import { level } from './test-games.js';

/** A corridor: a relic to pick up, a door a lever system opens, then an altar. */
function corridor(): LevelJson {
  const rows = Array.from({ length: 6 }, (_, y) => Array.from({ length: 24 }, (_, x) => (y === 0 || y === 5 || x === 0 || x === 23 ? '#' : y === 4 && x === 2 ? 'S' : '.')).join(''));
  return { ...level(rows), entities: [{ type: 'relic', x: 6, y: 4, props: {} }, { type: 'altar', x: 16, y: 4, props: {} }, { type: 'gate', x: 12, y: 1, props: {} }, { type: 'ghoul', x: 20, y: 4, props: {} }] };
}

/** Walks the player, and once they pass tile 11 opens a hole in the floor (tile 10, 5) and the gate, and fells the ghoul. */
const walker = defineSystem<{ opened: boolean }>({
  id: 'walker',
  init: () => ({ opened: false }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    p.vx = input.right ? 90 : input.left ? -90 : 0;
    ctx.move(p, p.vx * ctx.dt, 0);
    if (!s.opened && p.x > 90) {
      s.opened = true;
      ctx.map.setKind(10, 5, 'air');
      p.props['ab:wings'] = true;
      for (const e of ctx.world.entities) if (e.type === 'gate' || e.type === 'ghoul') e.alive = false;
    }
  },
});

const options: SimOptions = {
  feel: CELESTE_CLASS,
  systems: [walker, pickups, rest],
  level: corridor(),
  seed: 1,
  entityDefs: [
    { type: 'relic', w: 6, h: 6, pickup: true, gravity: false },
    { type: 'altar', w: 10, h: 12, gravity: false },
    { type: 'gate', w: 8, h: 8, gravity: false },
    { type: 'ghoul', w: 8, h: 8, gravity: false, contactDamage: 1 },
  ],
  player: { w: 6, h: 8, hp: 5 },
};

function play(sim: Sim, script: Array<[number, Partial<ReturnType<typeof emptyInput>>]>): void {
  for (const [ticks, keys] of script) for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...keys });
}

describe('rest', () => {
  it('beside an altar, up rests: health back, the checkpoint there, and a save of what was found and opened', () => {
    const sim = createSim(options);
    const saves: ProgressSave[] = [];
    sim.events.on('custom:rest', (ev) => saves.push(ev.payload['save'] as ProgressSave));
    sim.world.player.hp = 2;
    // Up far from the altar does nothing.
    play(sim, [[2, { up: true }], [2, {}]]);
    expect(saves).toHaveLength(0);
    play(sim, [[77, { right: true }], [1, {}], [1, { up: true }]]);
    expect(saves).toHaveLength(1);
    const save = saves[0]!;
    expect(sim.world.player.hp).toBe(5);
    expect(sim.world.checkpoint).toEqual(save.at);
    // The relic and the gate stay gone; the ghoul, an enemy, comes back.
    expect(save.removed).toEqual([0, 2]);
    expect(save.tiles).toEqual([[10, 5, 'air']]);
    expect(save.props).toMatchObject({ 'ab:wings': true });
  });

  it('picks the level up from its save: the relic gone, the hole open, and the same inputs play the same game', () => {
    const sim = createSim(options);
    let save: ProgressSave | null = null;
    sim.events.on('custom:rest', (ev) => (save = ev.payload['save'] as ProgressSave));
    play(sim, [[77, { right: true }], [1, {}], [1, { up: true }]]);
    const resumed = (): Sim => createSim({ ...options, resume: save! });
    const a = resumed();
    expect(a.world.entities.some((e) => e.type === 'relic' || e.type === 'gate')).toBe(false);
    expect(a.world.entities.some((e) => e.type === 'ghoul')).toBe(true);
    expect(a.map.kindAt(10, 5)).toBe('air');
    expect([a.world.player.x, a.world.player.y]).toEqual([save!.at.x, save!.at.y]);
    const b = resumed();
    play(a, [[40, { left: true }]]);
    play(b, [[40, { left: true }]]);
    expect(a.hash()).toBe(b.hash());
  });
});
