import { SystemsJson, type LevelJson } from '@gg/schemas';
import { createSim, emptyInput, type InputState, type Sim } from '@gg/sdk';
import { runBot, simOptionsFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { metroidvania, progression } from './node.js';

const FEEL = metroidvania.feelPresets[metroidvania.defaultFeel]!;
const SYSTEMS = SystemsJson.parse({ version: 1, genre: 'metroidvania', feelPreset: metroidvania.defaultFeel, systems: Object.keys(metroidvania.systems).map((id) => ({ id, params: {} })) });
const simFor = (level: LevelJson, seed = 1): Sim => createSim({ ...simOptionsFor(metroidvania, SYSTEMS), level, seed });
const run = (level: LevelJson, bot: string, seconds = 90) => runBot(simFor(level), metroidvania.bots[bot]!, seconds * 60);
const step = (sim: Sim, input: Partial<InputState>, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...input });
};
const without = (level: LevelJson, type: string): LevelJson => ({ ...level, entities: level.entities.filter((e) => e.type !== type) });

/** A flat 30x12 room with a floor at row 10 for system-level tests. */
function room(entities: LevelJson['entities'], rows?: string[]): LevelJson {
  const base = Array.from({ length: 12 }, (_, y) => (y >= 10 ? '#'.repeat(30) : `#${'.'.repeat(28)}#`));
  const r = rows ?? base;
  return { version: 1, id: 'room', name: 'Room', tileSize: 8, width: 30, height: 12, legend: { '.': 'air', '#': 'solid', '^': 'hazard', G: 'goal', S: 'spawn' }, rows: r.map((row, y) => (y === 9 ? row.slice(0, 28) + 'G' + row.slice(29) : row)), entities, spawn: { x: 2, y: 9 }, goal: { x: 28, y: 9 } };
}

describe('metroidvania template', () => {
  it('generates caverns the validator accepts, the seeker finishes and the greedy walker cannot', () => {
    for (const difficulty of [0.1, 0.25, 0.6]) {
      for (const seed of [1, 2, 3]) {
        const level = metroidvania.levelGrammar.generate({ seed, difficulty });
        const report = metroidvania.levelGrammar.validate(level, FEEL);
        expect(report.ok, `seed ${seed} d=${difficulty}: ${report.issues.map((i) => i.code).join(',')}`).toBe(true);
        expect(report.metrics['gated']).toBe(true);
        expect(run(level, 'seeker').completed, `seeker on seed ${seed} d=${difficulty}`).toBe(true);
        expect(run(level, 'walker', 60).completed, `walker on seed ${seed} d=${difficulty}`).toBe(false);
      }
    }
  });

  it('orders the progression wings > key > door > boots and every gate holds without its relic', () => {
    const level = metroidvania.levelGrammar.generate({ seed: 3, difficulty: 0.4 });
    expect(progression(level, FEEL).steps.map((s) => s.type)).toEqual(['wings', 'key', 'door', 'boots']);
    for (const relic of ['wings', 'key', 'boots']) {
      const cut = without(level, relic);
      const report = metroidvania.levelGrammar.validate(cut, FEEL);
      expect(report.issues.some((i) => i.code === 'goal_unreachable'), `validator without ${relic}`).toBe(true);
      expect(run(cut, 'seeker').completed, `seeker without ${relic}`).toBe(false);
    }
  });

  it('holds every gate under each feel preset', () => {
    const level = metroidvania.levelGrammar.generate({ seed: 5, difficulty: 0.3 });
    for (const [id, feel] of Object.entries(metroidvania.feelPresets)) {
      expect(metroidvania.levelGrammar.validate(level, feel).ok, id).toBe(true);
      for (const relic of ['wings', 'boots']) expect(metroidvania.levelGrammar.validate(without(level, relic), feel).ok, `${id} without ${relic}`).toBe(false);
      const systems = SystemsJson.parse({ ...SYSTEMS, feelPreset: id });
      expect(runBot(createSim({ ...simOptionsFor(metroidvania, systems), level, seed: 1 }), metroidvania.bots['seeker']!, 90 * 60).completed, id).toBe(true);
    }
  });

  it('relics grant abilities, keys open doors at runtime, abilities survive a death', () => {
    // wings at x=4, a key at x=6, a door at x=12 set in a wall from the ceiling to the floor.
    // Spikes at x=20 on the walking row, past the door.
    const rows = Array.from({ length: 12 }, (_, y) => (y >= 10 ? '#'.repeat(30) : `#${'.'.repeat(11)}#${'.'.repeat(7)}${y === 9 ? '^' : '.'}${'.'.repeat(8)}#`));
    const sim = simFor(room([{ type: 'wings', x: 4, y: 9, props: {} }, { type: 'key', x: 6, y: 9, props: {} }, { type: 'door', x: 12, y: 9, props: {} }], rows));
    expect(sim.map.kindAt(12, 9)).toBe('solid');
    step(sim, { right: true }, 90);
    const p = sim.world.player;
    expect(p.flags['double-jump']).toBe(true);
    expect(sim.map.kindAt(12, 9)).toBe('air');
    expect(sim.map.kindAt(12, 7)).toBe('air');
    expect(sim.map.kindAt(12, 6)).toBe('solid');
    expect(sim.map.version).toBe(3);
    expect(sim.world.hud['keys']).toBe(0);
    expect(p.x / 8).toBeGreaterThan(13);
    expect(sim.events.count('checkpoint')).toBeGreaterThan(0);
    step(sim, { right: true }, 40);
    expect(sim.world.deaths).toBe(1);
    step(sim, {}, 40);
    expect(sim.world.player.alive).toBe(true);
    expect(sim.world.player.flags['double-jump']).toBe(true);
  });

  it('gates the movement: no air jump or dash before the relics, one of each per airtime after', () => {
    const peak = (sim: Sim) => {
      let top = sim.world.player.y;
      for (let t = 0; t < 80; t++) {
        step(sim, { jump: t < 20 || (t >= 22 && t < 42) });
        top = Math.min(top, sim.world.player.y);
      }
      return sim.world.player.y - top;
    };
    const plain = simFor(room([]));
    step(plain, {}, 5);
    const winged = simFor(room([{ type: 'wings', x: 2, y: 9, props: {} }]));
    step(winged, {}, 5);
    expect(winged.world.player.flags['double-jump']).toBe(true);
    const single = peak(plain);
    const double = peak(winged);
    expect(single).toBeLessThan(32);
    expect(double).toBeGreaterThan(48);
    const noBoots = simFor(room([]));
    step(noBoots, {}, 5);
    step(noBoots, { dash: true });
    expect(noBoots.events.count('dash')).toBe(0);
    // A ledge 18 tiles above the floor: one dash while falling, a second press (cooldown over) is refused, landing refreshes it.
    const drop = Array.from({ length: 30 }, (_, y) => (y >= 28 ? '#'.repeat(30) : y === 10 ? `#${'###'}${'.'.repeat(25)}#` : `#${'.'.repeat(28)}#`));
    const booted = createSim({ ...simOptionsFor(metroidvania, SYSTEMS), level: { ...room([{ type: 'boots', x: 2, y: 9, props: {} }]), height: 30, rows: drop.map((row, y) => (y === 27 ? row.slice(0, 28) + 'G' + row.slice(29) : row)), goal: { x: 28, y: 27 } }, seed: 1 });
    step(booted, {}, 5);
    expect(booted.world.player.flags['dash']).toBe(true);
    step(booted, { right: true }, 20);
    expect(booted.world.player.grounded).toBe(false);
    step(booted, { dash: true });
    step(booted, {}, 25);
    step(booted, { dash: true });
    expect(booted.world.player.grounded).toBe(false);
    expect(booted.events.count('dash')).toBe(1);
    step(booted, {}, 90);
    expect(booted.world.player.grounded).toBe(true);
    step(booted, { dash: true });
    expect(booted.events.count('dash')).toBe(2);
  });

  it('rejects open doors, entities in walls and unreachable goals', () => {
    const level = metroidvania.levelGrammar.generate({ seed: 2, difficulty: 0.3 });
    const door = level.entities.find((e) => e.type === 'door')!;
    const rows = level.rows.map((r, y) => (y >= door.y - 2 && y <= door.y ? r.slice(0, door.x) + '.' + r.slice(door.x + 1) : r));
    expect(metroidvania.levelGrammar.validate({ ...level, rows }, FEEL).issues.some((i) => i.code === 'door_not_embedded')).toBe(true);
    const buried = { ...level, entities: [...level.entities, { type: 'walker', x: 0, y: 5, props: {} }] };
    expect(metroidvania.levelGrammar.validate(buried, FEEL).issues.some((i) => i.code === 'entity_in_solid')).toBe(true);
  });

  it('chaos bot keeps the sim deterministic', () => {
    const level = metroidvania.levelGrammar.generate({ seed: 7, difficulty: 0.5 });
    const a = runBot(simFor(level, 3), metroidvania.bots['chaos']!, 1200);
    const b = runBot(simFor(level, 3), metroidvania.bots['chaos']!, 1200);
    expect(a.finalHash).toBe(b.finalHash);
  });

  it('exposes catalog metadata for every system', () => {
    for (const [id, mod] of Object.entries(metroidvania.systems)) {
      expect(mod.meta.id).toBe(id);
      expect(mod.meta.summary.length).toBeGreaterThan(10);
      expect(mod.meta.genres === '*' || mod.meta.genres.includes('metroidvania'), id).toBe(true);
    }
  });
});
