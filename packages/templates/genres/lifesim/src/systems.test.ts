import type { LevelJson } from '@gg/schemas';
import { createSim, emptyInput, type InputState, type Sim } from '@gg/sdk';
import { pickHighlighted, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { clockFace, lifesimRuntime } from './index.js';

/**
 * A small yard: the bin and the bed against the west wall, a two-tile stall to the east, two plots in the middle. The
 * things stand on wall tiles, so the player works them from the floor beside them, as on a real farm.
 */
const YARD: LevelJson = {
  version: 1,
  id: 'yard',
  name: 'Yard',
  tileSize: 8,
  width: 14,
  height: 8,
  legend: { '#': 'solid', '.': 'air' },
  rows: ['##############', '#............#', '##...........#', '#............#', '##........##.#', '#.........##.#', '#............#', '##############'],
  entities: [
    { type: 'bin', x: 1, y: 2, props: { quota: 300 } },
    { type: 'bed', x: 1, y: 4, props: {} },
    { type: 'shop', x: 10, y: 5, props: {} },
    { type: 'plot', x: 5, y: 2, props: {} },
    { type: 'plot', x: 6, y: 2, props: {} },
  ],
  spawn: { x: 2, y: 4 },
  goal: { x: 0, y: 0 },
};

const CROPS = { version: 1, crops: [{ id: 'turnip', name: 'Turnip', seedPrice: 10, sellPrice: 30, growDays: 2, look: { shape: 'root', color: '#efe3f2' } }] };

function farm(params: Record<string, Record<string, number>> = {}): Sim {
  const sys = systemsJsonFor(lifesimRuntime);
  const systems = { ...sys, systems: sys.systems.map((s) => ({ ...s, params: { ...s.params, ...params[s.id] } })) };
  return createSim({ ...simOptionsFor(lifesimRuntime, systems, { content: { crops: CROPS } }), level: YARD, seed: 1 });
}

const step = (sim: Sim, keys: Partial<InputState> = {}, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...keys });
};
/** Stand on a tile (the player's centre in it) and turn one way. */
function standFacing(sim: Sim, tx: number, ty: number, dir: 'left' | 'right' | 'up' | 'down') {
  const p = sim.world.player;
  p.x = tx * 8 + 0.5;
  p.y = ty * 8;
  p.vx = 0;
  p.vy = 0;
  step(sim, { [dir]: true });
  step(sim, {}, 2);
}
const press = (sim: Sim, key: keyof InputState = 'action') => {
  step(sim, { [key]: true });
  step(sim);
};
/** Take the highlighted card of every menu that opens, until none is open. */
const answer = (sim: Sim) => {
  for (let i = 0; i < 200 && sim.world.menu; i++) sim.step(pickHighlighted(sim));
};
const plot = (sim: Sim, x: number) => sim.world.entities.find((e) => e.type === 'plot' && Math.round(e.x / 8) === x)!;
const crops = (sim: Sim) => sim.world.entities.filter((e) => e.type === 'crop' && e.alive);
/** Sleep in the bed and wake the next morning. */
function sleep(sim: Sim) {
  standFacing(sim, 2, 4, 'left');
  press(sim);
  expect(sim.world.menu?.id).toBe('bed');
  answer(sim);
  step(sim, {}, 6);
  answer(sim);
}

describe('the farm day', () => {
  it('tills, sows and waters a plot; a watered planting grows overnight, ripens, and is harvested into the bag', () => {
    const sim = farm();
    const p = sim.world.player;
    expect(sim.world.hud['seeds']).toBe('Turnip 6');
    const energy = Number(sim.world.hud['energy']);
    standFacing(sim, 5, 3, 'up');
    expect([p.props['targetTx'], p.props['targetTy']]).toEqual([5, 2]);
    press(sim);
    expect(plot(sim, 5).props['tilled']).toBe(true);
    expect(plot(sim, 5).anim).toBe('tilled');
    expect(sim.world.hud['energy']).toBe(energy - 2);
    press(sim);
    expect(crops(sim)).toHaveLength(1);
    expect(crops(sim)[0]!.anim).toBe('seed');
    expect(sim.world.hud['seeds']).toBe('Turnip 5');
    press(sim);
    expect(plot(sim, 5).anim).toBe('watered');
    expect(sim.world.hud['energy']).toBe(energy - 3);
    // Watering twice in a day does nothing more.
    press(sim);
    expect(sim.world.hud['energy']).toBe(energy - 3);

    sleep(sim);
    expect(sim.world.hud['day']).toBe('2/7');
    expect(plot(sim, 5).props['age']).toBe(1);
    expect(plot(sim, 5).anim).toBe('tilled');
    expect(crops(sim)[0]!.anim).toBe('grown');
    // Unwatered, it waits; watered again, it ripens.
    sleep(sim);
    expect(plot(sim, 5).props['age']).toBe(1);
    standFacing(sim, 5, 3, 'up');
    press(sim);
    sleep(sim);
    expect(plot(sim, 5).props['ripe']).toBe(true);
    expect(crops(sim)[0]!.anim).toBe('ripe');
    standFacing(sim, 5, 3, 'up');
    press(sim);
    expect(p.props['crop:turnip']).toBe(1);
    expect(crops(sim)).toHaveLength(0);
    expect(sim.events.count('pickup')).toBe(1);
    expect(plot(sim, 5).props['tilled']).toBe(true);
  });

  it('ships the bag into the bin; the buyer pays overnight and a card says so in the morning', () => {
    const sim = farm();
    const p = sim.world.player;
    // Two turnips: short of the yard's quota, so the season goes on to the next morning.
    p.props['crop:turnip'] = 2;
    const gold = Number(sim.world.hud['gold']);
    standFacing(sim, 2, 2, 'left');
    press(sim);
    expect(p.props['crop:turnip']).toBe(0);
    expect(sim.world.hud['gold']).toBe(gold);
    expect(sim.events.count('custom:ship')).toBe(1);
    // Nothing more to ship: the bin says so.
    press(sim);
    expect(sim.events.count('custom:bin_empty')).toBe(1);
    standFacing(sim, 2, 4, 'left');
    press(sim);
    answer(sim);
    step(sim, {}, 6);
    expect(sim.world.menu?.id).toBe('shipped');
    expect(sim.world.menu?.options[0]?.detail).toBe('Shipped 2 for 60 gold overnight');
    answer(sim);
    expect(sim.world.hud['gold']).toBe(gold + 60);
  });

  it('the shop sells a pack of seeds the purse can pay for, and greys out what it cannot', () => {
    const sim = farm({ season: { startGold: 60 } });
    const p = sim.world.player;
    standFacing(sim, 9, 5, 'right');
    press(sim);
    expect(sim.world.menu?.id).toBe('shop');
    expect(sim.world.menu?.options.map((o) => [o.id, o.cost, o.disabled])).toEqual([['turnip', 50, false]]);
    answer(sim);
    expect(sim.world.hud['gold']).toBe(10);
    expect(p.props['seed:turnip']).toBe(11);
    step(sim, {}, 2);
    press(sim);
    expect(sim.world.menu?.options[0]?.disabled).toBe(true);
  });

  it('at two at night the player falls asleep where it stands, and wakes at the bed with half its energy', () => {
    const sim = farm({ 'day-clock': { dayLengthS: 30 }, energy: { maxEnergy: 40 } });
    standFacing(sim, 5, 3, 'up');
    press(sim);
    expect(sim.world.hud['time']).toBe('6:00 AM');
    step(sim, {}, 30 * 60);
    answer(sim);
    expect(sim.events.count('custom:day_end')).toBe(1);
    expect(sim.world.hud['day']).toBe('2/7');
    expect(sim.world.hud['energy']).toBe(20);
    expect([Math.round(sim.world.player.x / 8), Math.round(sim.world.player.y / 8)]).toEqual([2, 4]);
    expect(clockFace(25 * 60 + 50)).toBe('1:50 AM');
    expect(clockFace(12 * 60 + 5)).toBe('12:00 PM');
  });

  it('with no energy left the tools stop until a night in bed restores it', () => {
    const sim = farm({ energy: { maxEnergy: 10 }, farming: { tillCost: 6 } });
    standFacing(sim, 5, 3, 'up');
    press(sim);
    standFacing(sim, 6, 3, 'up');
    press(sim);
    expect(plot(sim, 6).props['tilled']).not.toBe(true);
    expect(sim.events.count('custom:too_tired')).toBe(1);
    sleep(sim);
    expect(sim.world.hud['energy']).toBe(10);
    standFacing(sim, 6, 3, 'up');
    press(sim);
    expect(plot(sim, 6).props['tilled']).toBe(true);
  });

  it('the season is won the moment the purse holds its quota, and lost when its last day ends short of it', () => {
    const won = farm();
    expect(won.world.hud['quota']).toBe(300);
    expect(won.world.hud['gold']).toBe(100);
    // 100 in the purse and seven turnips at 30 make the quota.
    won.world.player.props['crop:turnip'] = 7;
    standFacing(won, 2, 2, 'left');
    press(won);
    sleep(won);
    expect(won.world.flags.won).toBe(true);
    expect(won.events.count('level_complete')).toBe(1);

    const lost = farm({ season: { days: 3 } });
    for (let d = 0; d < 3; d++) sleep(lost);
    expect(lost.world.flags.gameOver).toBe(true);
    expect(lost.events.count('custom:season_over')).toBe(1);
  });

  it('starts every season fresh: a bag carried from the season before is emptied, the starter seeds handed out', () => {
    const sys = systemsJsonFor(lifesimRuntime);
    const sim = createSim({ ...simOptionsFor(lifesimRuntime, sys, { content: { crops: CROPS } }), level: YARD, seed: 1, carry: { 'seed:turnip': 9, 'crop:turnip': 4 } });
    expect(sim.world.player.props['seed:turnip']).toBe(6);
    expect(sim.world.player.props['crop:turnip']).toBe(0);
  });

  it('plays the same every time, and a save point mid-day replays to the same morning', () => {
    const run = (sim: Sim) => {
      standFacing(sim, 5, 3, 'up');
      press(sim);
      press(sim);
      press(sim);
      sleep(sim);
      return sim.hash();
    };
    expect(run(farm())).toBe(run(farm()));
    const sim = farm();
    standFacing(sim, 5, 3, 'up');
    press(sim);
    const save = sim.save();
    press(sim);
    press(sim);
    sleep(sim);
    const straight = sim.hash();
    sim.load(save);
    press(sim);
    press(sim);
    sleep(sim);
    expect(sim.hash()).toBe(straight);
  });
});
