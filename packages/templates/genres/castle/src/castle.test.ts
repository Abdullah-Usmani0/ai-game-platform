import { LevelJson, SystemsJson } from '@gg/schemas';
import { createSim, emptyInput, type InputState, type ProgressSave, type Sim, type SimOptions } from '@gg/sdk';
import { levelTicksOf, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { deathRule, deathSwitches } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { AB_PREFIX, castle, CHASM_TILES, envelopeFor, LEDGE_TILES, MAX_REGION_TILES, MAX_STRETCH, SCREEN_TILES, world } from './node.js';

const optionsFor = (feel: string = castle.defaultFeel): Omit<SimOptions, 'level' | 'seed'> =>
  simOptionsFor(castle, SystemsJson.parse({ ...systemsJsonFor(castle), feelPreset: feel }), { behaviours: castle.defaultBehaviours });
const run = (level: LevelJson, bot: string, feel?: string, ticks?: number) => {
  const options = optionsFor(feel);
  return runBot(createSim({ ...options, level, seed: 1 }), castle.bots[bot]!, ticks ?? levelTicksOf(options));
};
const without = (level: LevelJson, type: string): LevelJson => ({ ...level, entities: level.entities.filter((e) => e.type !== type) });
const errors = (level: LevelJson, feel: string = castle.defaultFeel) =>
  castle.levelGrammar
    .validate(level, castle.feelPresets[feel]!)
    .issues.filter((i) => i.severity === 'error')
    .map((i) => i.code);
const step = (sim: Sim, input: Partial<InputState>, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...input });
};

/** A small region by hand: rows as given, one room per 30 columns, the spawn at (3, 14) and the goal near the right. */
function region(rows: string[], kinds: Array<'room' | 'save' | 'exit'>, entities: LevelJson['entities'] = []): LevelJson {
  const width = rows[0]!.length;
  const goalX = rows[14]!.indexOf('G');
  return {
    version: 1,
    id: 'hand',
    name: 'Hand',
    tileSize: 16,
    width,
    height: rows.length,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal', S: 'spawn' },
    rows,
    entities,
    rooms: kinds.map((kind, i) => ({ id: `r${i}`, x: i * 30, y: 0, w: 30, h: rows.length, kind })),
    spawn: { x: 3, y: 14 },
    goal: { x: goalX, y: 14 },
  };
}

/** A flat run of `rooms` rooms 17 rows tall, doorways between them, the goal near the far wall; `edit` changes columns. */
function corridor(rooms: number, edit: (grid: string[][]) => void = () => {}): string[] {
  const width = rooms * 30;
  const grid = Array.from({ length: 17 }, (_, y) => Array.from({ length: width }, (_, x): string => (y === 0 || y >= 15 || x === 0 || x === width - 1 ? '#' : (x + 1) % 30 === 0 && y < 11 ? '#' : '.')));
  grid[14]![width - 5] = 'G';
  edit(grid);
  return grid.map((r) => r.join(''));
}

describe('castle template', () => {
  it('generates regions the validator accepts, the route bot finishes under both feels and the greedy walker cannot', () => {
    for (const difficulty of [0.1, 0.3, 0.6, 0.9]) {
      for (const seed of [1, 2]) {
        const level = castle.levelGrammar.generate({ seed, difficulty });
        for (const feel of Object.keys(castle.feelPresets)) {
          const report = castle.levelGrammar.validate(level, castle.feelPresets[feel]!);
          expect(report.ok, `seed ${seed} d=${difficulty} ${feel}: ${report.issues.map((i) => i.code).join(',')}`).toBe(true);
          expect(report.metrics['gated']).toBe(true);
          expect(run(level, 'route', feel).completed, `route on seed ${seed} d=${difficulty} ${feel}`).toBe(true);
        }
        expect(run(level, 'walker', undefined, 60 * 60).completed, `walker on seed ${seed} d=${difficulty}`).toBe(false);
      }
    }
  });

  it('lays a region out as rooms a screen wide or more, side by side, an altar in every save room and rests close together', () => {
    for (const difficulty of [0.15, 0.5, 0.9]) {
      const level = castle.levelGrammar.generate({ seed: 4, difficulty });
      expect(LevelJson.safeParse(level).success).toBe(true);
      expect(level.width).toBeLessThanOrEqual(MAX_REGION_TILES);
      const rooms = level.rooms!;
      expect(new Set(rooms.map((r) => r.id)).size).toBe(rooms.length);
      expect(rooms.reduce((x, r) => (expect(r.x).toBe(x), x + r.w), 0)).toBe(level.width);
      for (const r of rooms) expect(r.w).toBeGreaterThanOrEqual(SCREEN_TILES);
      expect(rooms.filter((r) => r.kind === 'save').length).toBe(difficulty >= 0.2 ? 2 : 1);
      expect(rooms.at(-1)!.kind).toBe('exit');
      const w = world(level, castle.feelPresets[castle.defaultFeel]!);
      expect(w.longestStretch.length).toBeLessThanOrEqual(MAX_STRETCH);
      expect(w.unreachableRooms).toEqual([]);
      expect(w.trap).toBeNull();
      if (difficulty >= 0.2) expect(rooms.length).toBeGreaterThanOrEqual(12);
    }
  });

  it('orders the progression wings > boots and every gate holds without its relic, under both feels', () => {
    const level = castle.levelGrammar.generate({ seed: 3, difficulty: 0.5 });
    for (const feel of Object.keys(castle.feelPresets)) {
      expect(world(level, castle.feelPresets[feel]!).steps.map((s) => s.type)).toEqual(['wings', 'boots']);
      for (const relic of ['wings', 'boots']) {
        const cut = without(level, relic);
        expect(errors(cut, feel), `${feel} without ${relic}`).toContain('goal_unreachable');
        expect(run(cut, 'route', feel, 120 * 60).completed, `${feel} route without ${relic}`).toBe(false);
      }
    }
  });

  it('sizes the gates so each needs its relic under every feel: the ledge the wings, the chasm the boots as well', () => {
    for (const [id, feel] of Object.entries(castle.feelPresets)) {
      const plain = envelopeFor(feel, 16, { doubleJump: false, dash: false });
      const wings = envelopeFor(feel, 16, { doubleJump: true, dash: false });
      const both = envelopeFor(feel, 16, { doubleJump: true, dash: true });
      expect(plain.jumpUpTiles, id).toBeLessThan(LEDGE_TILES);
      expect(wings.jumpUpTiles, id).toBeGreaterThanOrEqual(LEDGE_TILES);
      // Landing tile CHASM_TILES + 1 away from the take-off tile.
      expect(wings.maxDx.get(0)!, id).toBeLessThan(CHASM_TILES + 1);
      expect(both.maxDx.get(0)!, id).toBeGreaterThanOrEqual(CHASM_TILES + 1);
    }
  });

  it('the world solver finds a trap, a room never reached, rests too far apart and the wrong tiles', () => {
    // A pit with no spikes, deeper than any jump climbs out of, in a region with no relic: whoever drops in stays.
    const pitted = corridor(2).map((r, y) => (y >= 15 ? r.slice(0, 40) + '...' + r.slice(43) : r));
    const deep = [...pitted, ...Array.from({ length: 7 }, (_, i) => '#'.repeat(40) + (i < 5 ? '...' : '###') + '#'.repeat(17))];
    expect(errors(region(deep, ['room', 'exit']))).toContain('softlock');
    expect(errors(region(corridor(2), ['room', 'exit']))).not.toContain('softlock');
    // Five rooms in a row with no altar, past the start.
    expect(errors(region(corridor(6), ['room', 'room', 'room', 'room', 'room', 'exit']))).toContain('altars_far_apart');
    // A room behind a wall nobody gets past.
    const walled = corridor(3, (g) => {
      for (let y = 1; y < 15; y++) g[y]![59] = '#';
    });
    const sealed = region(walled, ['room', 'save', 'exit'], [{ type: 'altar', x: 45, y: 14, props: {} }]);
    expect(errors(sealed)).toEqual(expect.arrayContaining(['room_unreachable', 'goal_unreachable']));
    expect(errors({ ...region(corridor(2), ['room', 'exit']), tileSize: 8 })).toContain('tile_size');
    expect(errors({ ...region(corridor(2), ['room', 'exit']), rooms: [] })).toContain('no_rooms');
    expect(errors(region(corridor(2), ['save', 'exit']))).toContain('save_without_altar');
  });

  it('abilities last as props: a rest saves them and a region loaded from the rest starts with them', () => {
    const level = castle.levelGrammar.generate({ seed: 2, difficulty: 0.5 });
    const options = optionsFor();
    const sim = createSim({ ...options, level, seed: 1 });
    const saves: ProgressSave[] = [];
    sim.events.on('custom:rest', (ev) => saves.push(ev.payload['save'] as ProgressSave));
    const mem: Record<string, number> = {};
    for (let t = 0; t < levelTicksOf(options) && saves.length < 2; t++) sim.step(castle.bots['route']!(sim, t, mem));
    expect(saves).toHaveLength(2);
    const save = saves[1]!;
    expect(save.props).toMatchObject({ [`${AB_PREFIX}double-jump`]: true, [`${AB_PREFIX}dash`]: true });
    // The relics taken stay taken; the enemies come back.
    expect(save.removed.map((i) => level.entities[i]!.type)).toEqual(expect.arrayContaining(['wings', 'boots']));
    expect(save.removed.some((i) => ['ghoul', 'hound', 'gargoyle'].includes(level.entities[i]!.type))).toBe(false);
    // Loaded from the second rest, the region is won from there: the abilities are back before anything moves.
    const resumed = createSim({ ...options, level, seed: 1, resume: save });
    step(resumed, {});
    expect(resumed.world.player.flags['double-jump']).toBe(true);
    expect(resumed.world.player.flags['dash']).toBe(true);
    expect(resumed.world.entities.some((e) => e.type === 'wings' || e.type === 'boots')).toBe(false);
    expect(runBot(createSim({ ...options, level, seed: 1, resume: save }), castle.bots['route']!, levelTicksOf(options)).completed).toBe(true);
  });

  it('enemies sleep until their room is entered, and a region is given longer than a level to cross', () => {
    const level = castle.levelGrammar.generate({ seed: 1, difficulty: 0.6 });
    const options = optionsFor();
    const sim = createSim({ ...options, level, seed: 1 });
    step(sim, {}, 2);
    const enemies = sim.world.entities.filter((e) => e.fsm !== null);
    expect(enemies.length).toBeGreaterThan(0);
    // The player starts in the start room, which has none: every enemy sleeps.
    expect(enemies.every((e) => e.dormant === true)).toBe(true);
    expect(sim.world.hud['_room']).toBe('start');
    expect(levelTicksOf(options)).toBeGreaterThan(90 * 60);
  });

  it('a rest loads the region again and a fall returns to the last rest: the enemies back, everything found kept', () => {
    const level = castle.levelGrammar.generate({ seed: 2, difficulty: 0.5 });
    const options = optionsFor();
    const sim = createSim({ ...options, level, seed: 1 });
    const route = castle.bots['route']!;
    let rests = 0;
    sim.events.on('custom:rest', () => rests++);
    const foes = (l: { entities: ReadonlyArray<{ type: string }> }) => l.entities.filter((e) => ['ghoul', 'hound', 'gargoyle'].includes(e.type)).length;
    const mem: Record<string, number> = {};
    let t = 0;
    for (; t < levelTicksOf(options) && rests < 2; t++) sim.step(route(sim, t, mem));
    expect(rests).toBe(2);
    // The region loaded again at the second rest: every enemy back, the relics taken still taken.
    expect(sim.world.reloaded).toEqual({ tick: sim.tick - 1, fromDeath: false });
    expect(foes(sim.world)).toBe(foes(level));
    expect(sim.world.entities.some((e) => e.type === 'wings' || e.type === 'boots')).toBe(false);
    // The HUD still shows what was found: the relics, and the souls taken.
    const coins = sim.world.hud['coins'];
    step(sim, {});
    expect(sim.world.hud['relics']).toBe('wings+boots');
    expect(sim.world.hud['coins']).toBe(coins);
    const altar = { ...sim.world.checkpoint };
    // A fall further on: a second later the player wakes at that altar, with the enemies back and the abilities kept.
    for (let i = 0; i < 120; i++, t++) sim.step(route(sim, t, mem));
    sim.world.player.alive = false;
    for (let i = 0; i < 61; i++, t++) sim.step(emptyInput());
    const p = sim.world.player;
    expect(p.alive).toBe(true);
    expect([p.x, p.y]).toEqual([altar.x, altar.y]);
    expect(sim.world.reloaded?.fromDeath).toBe(true);
    expect(foes(sim.world)).toBe(foes(level));
    step(sim, {});
    expect(sim.world.player.flags['double-jump']).toBe(true);
    expect(sim.world.player.flags['dash']).toBe(true);
    // And the route goes on from there to the end, with no rest at an altar already rested at.
    for (; t < levelTicksOf(options) && !sim.world.flags.won; t++) sim.step(route(sim, t, mem));
    expect(sim.world.flags.won).toBe(true);
    expect(rests).toBe(2);
  });

  it('lets the rest decide what a fall does, and switches the hazards respawn off as the composition rules would', () => {
    const metas = Object.values(castle.systems).map((m) => m.meta);
    expect(deathRule(metas).owner?.id).toBe('rest');
    expect(castle.composedParams).toEqual(deathSwitches(metas));
  });
});
