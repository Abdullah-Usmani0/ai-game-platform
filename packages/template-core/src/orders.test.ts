import type { LevelJson, Objectives } from '@gg/schemas';
import { CELESTE_CLASS, createSim, emptyInput, Rng, type InputState, type Sim, type SimOptions, type SystemDef } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { runBot } from './bots.js';
import { courier } from './courier.js';
import { carry, CARRYING, ORDER_LEFT } from './systems/carry.js';
import { objectives } from './systems/objectives.js';
import { HURRY_TICKS, ORDER_MAX, orders, orderTiming } from './systems/orders.js';
import { level, walker } from './test-games.js';

const DEFS: SimOptions['entityDefs'] = [
  { type: 'cargo', w: 6, h: 6 },
  { type: 'source', w: 8, h: 8, gravity: false },
  { type: 'dropoff', w: 16, h: 16, gravity: false },
];
const MARKS: Record<string, string> = { s: 'source', d: 'dropoff' };

function room(rows: string[], difficulty?: number): LevelJson {
  const l = level(rows.map((r) => r.replace(/[sd]/g, '.')));
  const entities = rows.flatMap((r, y) => [...r].flatMap((ch, x) => (MARKS[ch] ? [{ type: MARKS[ch]!, x, y, props: {} }] : [])));
  return { ...l, entities, ...(difficulty === undefined ? {} : { ramp: { segment: 0, difficulty } }) };
}

/** A café: the kitchen hatch by the door, three tables round the room. */
const CAFE = room(['########################', '#......................#', '#..d.............d.....#', '#......................#', '#.S.s..................#', '#......................#', '#..........d...........#', '#......................#', '########################']);

const rules = (n: number, lives?: number): Objectives => ({ version: 1, win: { mode: 'all', clauses: [{ kind: 'hud_at_least', key: 'delivered', value: n }] }, lose: lives === undefined ? [] : [{ kind: 'lives', count: lives }] });

function cafe(opts: { lvl?: LevelJson; orders?: Record<string, number>; goal?: number; lives?: number; hp?: number } = {}): Sim {
  return createSim({
    level: opts.lvl ?? CAFE,
    feel: CELESTE_CLASS,
    seed: 1,
    systems: [walker, carry, orders, objectives] as SystemDef<unknown>[],
    entityDefs: DEFS,
    player: { w: 8, h: 8, hp: opts.hp ?? 3 },
    movementMode: 'topdown',
    params: { carry: {}, orders: { ...opts.orders } },
    content: { objectives: rules(opts.goal ?? 99, opts.lives) },
  });
}

const fired = (sim: Sim, name: string) => sim.events.history().filter((e) => e.name === name);
const drops = (sim: Sim) => sim.world.entities.filter((e) => e.type === 'dropoff');
const idle = (sim: Sim, n: number) => {
  for (let i = 0; i < n; i++) sim.step(emptyInput());
};

describe('orders', () => {
  it('a free table asks after firstS, waits patienceS with the time on its props, and hurries the last three seconds', () => {
    const sim = cafe({ orders: { firstS: 1, patienceS: 10, everyS: 30 } });
    idle(sim, 59);
    expect(fired(sim, 'custom:order')).toHaveLength(0);
    idle(sim, 2);
    expect(fired(sim, 'custom:order')).toHaveLength(1);
    const asking = drops(sim).find((e) => Number(e.props[ORDER_LEFT]) > 0)!;
    // An easy level (no ramp) gives a fifth longer.
    expect(asking.props[ORDER_MAX]).toBe(720);
    expect(asking.anim).toBe('wants');
    // Opened at tick 60, it hurries the tick it has three seconds left, and not before.
    idle(sim, 720 - HURRY_TICKS - 1);
    expect(fired(sim, 'custom:order_hurry')).toHaveLength(0);
    idle(sim, 1);
    expect(fired(sim, 'custom:order_hurry')).toHaveLength(1);
    expect(asking.props[ORDER_LEFT]).toBe(HURRY_TICKS);
  });

  it('a delivery on the last tick of an order fills it; a tick later the table turns it down and the order is missed', () => {
    const serve = (late: boolean) => {
      const sim = cafe({ orders: { firstS: 0, patienceS: 30, everyS: 60 } });
      idle(sim, 1);
      const table = drops(sim).find((e) => Number(e.props[ORDER_LEFT]) > 0)!;
      table.props[ORDER_LEFT] = 1;
      const p = sim.world.player;
      p.props[CARRYING] = 'cargo';
      p.x = table.x - p.w - 2;
      p.y = table.y;
      if (late) idle(sim, 1);
      sim.step({ ...emptyInput(), action: true });
      idle(sim, 2);
      return sim;
    };
    const onTime = serve(false);
    expect(fired(onTime, 'custom:order_filled')).toHaveLength(1);
    expect(fired(onTime, 'custom:order_filled')[0]!.payload['tip']).toBe(0);
    expect(fired(onTime, 'custom:order_missed')).toHaveLength(0);
    expect(onTime.world.player.hp).toBe(3);
    const late = serve(true);
    expect(fired(late, 'custom:no_order')).toHaveLength(1);
    expect(fired(late, 'custom:order_missed')).toHaveLength(1);
    expect(late.world.hud['delivered']).toBe(0);
    expect(late.world.player.hp).toBe(2);
  });

  it('a missed order costs health even right after another blow, rests the table, and counts against progress', () => {
    const sim = cafe({ orders: { firstS: 0, patienceS: 4, everyS: 30, missDamage: 1 } });
    idle(sim, 2);
    sim.world.player.invulnTicks = 60;
    const before = sim.progress();
    idle(sim, 4 * 72 + 5);
    expect(fired(sim, 'custom:order_missed')).toHaveLength(1);
    expect(sim.world.player.hp).toBe(2);
    // The strike comes from nothing: a load in hand stays there.
    expect(fired(sim, 'hit').at(-1)!.payload['source']).toBeNull();
    expect(sim.progress()).toBeLessThan(before);
    const missedAt = drops(sim).find((e) => e.id === fired(sim, 'custom:order_missed')[0]!.payload['entity'])!;
    expect(missedAt.anim).toBe('idle');
  });

  it('a table that has just been served or walked out on rests restS before it asks again', () => {
    const ALONE = room(['##########', '#........#', '#.S...d..#', '#........#', '##########']);
    const sim = cafe({ lvl: ALONE, orders: { firstS: 0, everyS: 2, patienceS: 4, restS: 3, missDamage: 0 } });
    idle(sim, 900);
    const missed = fired(sim, 'custom:order_missed');
    const asked = fired(sim, 'custom:order');
    expect(missed.length).toBeGreaterThan(1);
    for (const m of missed) {
      const next = asked.find((e) => e.tick > m.tick);
      if (!next) continue;
      // Not before its rest is over, and as soon as it is: the order was due long before.
      expect(next.tick - m.tick).toBe(180);
    }
  });

  it('no more than maxOpen wait at once, and the schedule is the same every run', () => {
    const run = () => {
      const sim = cafe({ orders: { firstS: 0, everyS: 2, patienceS: 60, maxOpen: 2 } });
      let most = 0;
      for (let i = 0; i < 900; i++) {
        sim.step(emptyInput());
        most = Math.max(most, drops(sim).filter((e) => Number(e.props[ORDER_LEFT]) > 0).length);
      }
      return { most, at: fired(sim, 'custom:order').map((e) => `${e.tick}:${String(e.payload['entity'])}`) };
    };
    const a = run();
    expect(a.most).toBe(2);
    expect(run()).toEqual(a);
  });

  it('harder levels give less time and ask more often', () => {
    const easy = orderTiming({ params: { patienceS: 10, everyS: 5 }, map: { level: room(['###', '#S#', '###'], 0) } as never });
    const hard = orderTiming({ params: { patienceS: 10, everyS: 5 }, map: { level: room(['###', '#S#', '###'], 1) } as never });
    expect(easy).toMatchObject({ patience: 720, every: 360 });
    expect(hard).toMatchObject({ patience: 480, every: 240 });
  });

  it('a delivery in time fills the order: ten points and a tip for the time left', () => {
    const sim = cafe({ orders: { firstS: 0, patienceS: 30, everyS: 60, tipMax: 10 } });
    const r = runBot(sim, courier, 2000);
    expect(r.completed).toBe(false);
    const filled = fired(sim, 'custom:order_filled');
    expect(filled.length).toBeGreaterThan(0);
    const first = filled[0]!.payload;
    expect(Number(first['points'])).toBe(10 + Number(first['tip']));
    expect(Number(first['tip'])).toBeGreaterThan(0);
    expect(sim.world.hud['delivered']).toBe(filled.length);
  });

  it('the courier keeps a café going; standing still or random keys lose it', () => {
    const won = cafe({ goal: 8, lives: 1 });
    expect(runBot(won, courier, 60 * 120).completed).toBe(true);
    const still = cafe({ goal: 8, lives: 1 });
    runBot(still, () => emptyInput(), 60 * 120);
    expect(still.world.flags.gameOver).toBe(true);
    const rng = new Rng(3);
    const keys = ['left', 'right', 'up', 'down', 'action'] as const;
    const mash = cafe({ goal: 8, lives: 1 });
    let held: InputState = emptyInput();
    runBot(mash, (_s, tick) => {
      if (tick % 12 === 0) held = { ...emptyInput(), [keys[rng.int(keys.length)]!]: true };
      return held;
    }, 60 * 120);
    expect(mash.world.flags.won).toBe(false);
  });
});
