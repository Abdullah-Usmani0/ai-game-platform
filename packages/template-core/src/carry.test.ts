import type { LevelJson, Objectives } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type InputState, type Sim, type SimOptions, type SystemDef } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { runBot } from './bots.js';
import { courier } from './courier.js';
import { checkStations, dressStations, type StationsCtx } from './level/stations.js';
import { carry, CARRYING, ORDER_LEFT } from './systems/carry.js';
import { objectives } from './systems/objectives.js';
import { level, walker } from './test-games.js';

/** Run and jump, high enough to clear a tile or two (the explorer tests' runner barely leaves the ground). */
const jumper = defineSystem<null>({
  id: 'jumper',
  init: () => null,
  fixedUpdate(_s, input, ctx) {
    const p = ctx.world.player;
    const f = ctx.feel;
    if (!p.alive) return;
    p.vx = input.left ? -f.maxRun : input.right ? f.maxRun : 0;
    p.vy = Math.min(p.vy + f.gravity * ctx.dt * (input.jump && p.vy < 0 ? 0.5 : 1), f.maxFall);
    if (input.jump && p.grounded) p.vy = f.jumpSpeed;
    ctx.move(p, p.vx * ctx.dt, p.vy * ctx.dt);
  },
});

const DEFS: SimOptions['entityDefs'] = [
  { type: 'cargo', w: 6, h: 6 },
  { type: 'source', w: 8, h: 8, gravity: false },
  { type: 'dropoff', w: 16, h: 16, gravity: false },
  { type: 'brute', w: 8, h: 8, gravity: false },
];
const MARKS: Record<string, string> = { s: 'source', d: 'dropoff', c: 'cargo', b: 'brute' };

/** A level from rows, with a source 's', dropoffs 'd' (two tiles wide and tall, standing on their tile), cargo 'c'. */
function room(rows: string[]): LevelJson {
  const l = level(rows.map((r) => r.replace(/[sdcb]/g, '.')));
  const entities = rows.flatMap((r, y) => [...r].flatMap((ch, x) => (MARKS[ch] ? [{ type: MARKS[ch]!, x, y, props: {} }] : [])));
  return { ...l, entities };
}

/** The spawn, a source two tiles on, a dropoff further right. */
const ROOM = room(['################', '#..............#', '#..............#', '#.S.s.....d....#', '#..............#', '################']);

const deliveries = (n: number): Objectives => ({ version: 1, win: { mode: 'all', clauses: [{ kind: 'hud_at_least', key: 'delivered', value: n }] }, lose: [] });

function game(opts: { lvl?: LevelJson; params?: Record<string, number | string>; systems?: SystemDef<unknown>[]; mover?: SystemDef<unknown>; mode?: 'topdown' | 'platformer'; goal?: number } = {}): Sim {
  return createSim({
    level: opts.lvl ?? ROOM,
    feel: CELESTE_CLASS,
    seed: 1,
    systems: [opts.mover ?? walker, carry, ...(opts.systems ?? []), objectives] as SystemDef<unknown>[],
    entityDefs: DEFS,
    player: { w: 8, h: 8, hp: 3 },
    movementMode: opts.mode ?? 'topdown',
    params: { carry: { ...opts.params } },
    content: { objectives: deliveries(opts.goal ?? 99) },
  });
}

const key = (k: keyof InputState): InputState => ({ ...emptyInput(), [k]: true });
const steps = (sim: Sim, input: InputState, n: number) => {
  for (let i = 0; i < n; i++) sim.step(input);
};
/** Presses a key once: a tick held, a tick let go. */
const press = (sim: Sim, k: keyof InputState = 'action') => {
  sim.step(key(k));
  sim.step(emptyInput());
};
const fired = (sim: Sim, name: string) => sim.events.history().filter((e) => e.name === name);
const live = (sim: Sim, type: string) => sim.world.entities.filter((e) => e.alive && e.type === type);

describe('carry', () => {
  it('takes the next item from a source in reach and hands it over at a dropoff, counting the delivery', () => {
    const sim = game();
    press(sim);
    // Two tiles away the source is out of reach: nothing happens.
    expect(sim.world.player.props[CARRYING]).toBeUndefined();
    steps(sim, key('right'), 3);
    expect(live(sim, 'source')[0]!.flags['reach']).toBe(true);
    press(sim);
    expect(sim.world.player.props[CARRYING]).toBe('cargo');
    expect(fired(sim, 'custom:lift')).toHaveLength(1);
    steps(sim, key('right'), 50);
    expect(live(sim, 'dropoff')[0]!.flags['reach']).toBe(true);
    press(sim);
    expect(sim.world.player.props[CARRYING]).toBeUndefined();
    expect(sim.world.hud['delivered']).toBe(1);
    expect(fired(sim, 'custom:deliver')[0]!.payload).toMatchObject({ type: 'cargo', delivered: 1 });
  });

  it('makes the next item only after makeS, and says so when asked before', () => {
    const sim = game({ params: { makeS: 5 } });
    steps(sim, key('right'), 3);
    press(sim);
    // Put it down out of reach of the source, come back: the source has nothing yet.
    steps(sim, key('right'), 20);
    press(sim);
    expect(live(sim, 'cargo')).toHaveLength(1);
    expect(fired(sim, 'custom:drop')[0]!.payload['why']).toBe('put');
    steps(sim, key('left'), 20);
    press(sim);
    expect(fired(sim, 'custom:not_ready')).toHaveLength(1);
    expect(live(sim, 'source')[0]!.anim).toBe('idle');
    // What lies on the floor can be picked up again, before anything a source makes.
    steps(sim, key('right'), 14);
    press(sim);
    expect(sim.world.player.props[CARRYING]).toBe('cargo');
    expect(live(sim, 'cargo')).toHaveLength(0);
    steps(sim, emptyInput(), 300);
    expect(live(sim, 'source')[0]!.anim).toBe('ready');
  });

  it('with timed orders, a dropoff takes cargo only while it asks for some', () => {
    const orders = defineSystem<null>({ id: 'orders', init: () => null, fixedUpdate: () => {} });
    const sim = game({ systems: [orders] });
    steps(sim, key('right'), 3);
    press(sim);
    steps(sim, key('right'), 50);
    press(sim);
    expect(fired(sim, 'custom:no_order')).toHaveLength(1);
    expect(sim.world.player.props[CARRYING]).toBe('cargo');
    live(sim, 'dropoff')[0]!.props[ORDER_LEFT] = 120;
    press(sim);
    expect(sim.world.hud['delivered']).toBe(1);
  });

  it('a blow knocks what is held to the floor; a strike from nothing does not', () => {
    const blows = defineSystem<null>({
      id: 'blows',
      init: () => null,
      fixedUpdate(_s, _i, ctx) {
        const p = ctx.world.player;
        if (ctx.tick === 10) ctx.damage(p, 1, null);
        if (ctx.tick === 80) ctx.damage(p, 1, ctx.world.entities.find((e) => e.type === 'brute')!);
      },
    });
    const sim = game({ lvl: room(['################', '#.............b#', '#..............#', '#.S.s.....d....#', '#..............#', '################']), systems: [blows] });
    steps(sim, key('right'), 3);
    press(sim);
    steps(sim, emptyInput(), 20);
    expect(sim.world.player.props[CARRYING]).toBe('cargo');
    steps(sim, emptyInput(), 70);
    expect(sim.world.player.props[CARRYING]).toBeUndefined();
    expect(live(sim, 'cargo')).toHaveLength(1);
    expect(fired(sim, 'custom:drop')[0]!.payload['why']).toBe('hit');
  });

  it('works on the key the game sets it to, and on no other', () => {
    const sim = game({ params: { key: 'jump' } });
    steps(sim, key('right'), 3);
    press(sim, 'action');
    expect(sim.world.player.props[CARRYING]).toBeUndefined();
    press(sim, 'jump');
    expect(sim.world.player.props[CARRYING]).toBe('cargo');
  });

  it('saves and loads while carrying: the same run from there', () => {
    const sim = game();
    steps(sim, key('right'), 3);
    press(sim);
    const save = sim.save();
    steps(sim, key('right'), 50);
    press(sim);
    const after = sim.snapshot().hash;
    sim.load(save);
    expect(sim.world.player.props[CARRYING]).toBe('cargo');
    steps(sim, key('right'), 50);
    press(sim);
    expect(sim.snapshot().hash).toBe(after);
    expect(sim.world.hud['delivered']).toBe(1);
  });

  it('progress grows with the deliveries and with each leg of a trip', () => {
    const sim = game({ goal: 4 });
    const start = sim.progress();
    steps(sim, key('right'), 3);
    press(sim);
    const lifted = sim.progress();
    steps(sim, key('right'), 50);
    const there = sim.progress();
    press(sim);
    const done = sim.progress();
    expect(start).toBeLessThan(lifted);
    expect(lifted).toBeLessThan(there);
    expect(there).toBeLessThan(done);
    // The objectives' own HUD goal counts too: one of four.
    expect(done).toBeGreaterThanOrEqual(0.25);
  });
});

describe('the courier', () => {
  it('works a top-down room until the goal is met', () => {
    const lvl = room(['####################', '#..................#', '#.S.s..............#', '#..........#.......#', '#..........#....d..#', '#..................#', '####################']);
    const sim = game({ lvl, goal: 4 });
    const r = runBot(sim, courier, 4000);
    expect(r.completed, `delivered ${String(sim.world.hud['delivered'])}`).toBe(true);
    expect(sim.world.hud['delivered']).toBe(4);
  });

  it('runs and jumps a side view to the dropoff and back', () => {
    // A bump on the way: the courier jumps it, there and back.
    const lvl = room(['######################', '#....................#', '#....................#', '#...............d....#', '#.S.s....##..........#', '######################']);
    const sim = game({ lvl, goal: 3, mover: jumper, mode: 'platformer' });
    const r = runBot(sim, courier, 5000);
    expect(r.completed, `delivered ${String(sim.world.hud['delivered'])}`).toBe(true);
  });

  it('presses the key the game sets', () => {
    const sim = game({ goal: 2, params: { key: 'jump' } });
    expect(runBot(sim, courier, 3000).completed).toBe(true);
  });
});

describe('stations', () => {
  const ctx = (mode: 'topdown' | 'platformer', dropoffs = 3): StationsCtx => ({ movementMode: mode, feel: CELESTE_CLASS, types: { source: 'source', dropoff: 'dropoff' }, sizes: { source: { w: 8, h: 8 }, dropoff: { w: 16, h: 16 } }, dropoffs });
  const field = (): LevelJson => {
    const w = 40;
    const h = 24;
    const rows = Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : `#${'.'.repeat(w - 2)}#`));
    rows[12] = `${rows[12]!.slice(0, 20)}S${rows[12]!.slice(21)}`;
    return level(rows);
  };

  it('top-down: a source near the spawn and the dropoffs spread round it, on solid ground, all reachable', () => {
    const dressed = dressStations(field(), 3, ctx('topdown'));
    const types = dressed.entities.map((e) => e.type);
    expect(types.filter((t) => t === 'source')).toHaveLength(1);
    expect(types.filter((t) => t === 'dropoff')).toHaveLength(3);
    expect(checkStations(dressed, ctx('topdown'))).toEqual([]);
    for (const e of dressed.entities) {
      expect(Math.abs(e.x - dressed.spawn.x), e.type).toBeLessThanOrEqual(10);
      expect(Math.abs(e.y - dressed.spawn.y), e.type).toBeLessThanOrEqual(5);
    }
    // The same seed places them the same; another seed elsewhere.
    expect(dressStations(field(), 3, ctx('topdown'))).toEqual(dressed);
    expect(dressStations(field(), 4, ctx('topdown')).entities).not.toEqual(dressed.entities);
  });

  it('top-down: a station moved off its solid ground, or missing, is reported', () => {
    const dressed = dressStations(field(), 3, ctx('topdown'));
    const moved = { ...dressed, entities: dressed.entities.map((e) => (e.type === 'source' ? { ...e, x: e.x + 3 } : e)) };
    expect(checkStations(moved, ctx('topdown')).map((i) => i.code)).toContain('station_not_solid');
    expect(checkStations({ ...dressed, entities: dressed.entities.filter((e) => e.type !== 'dropoff') }, ctx('topdown')).map((i) => i.code)).toEqual(['stations_missing']);
  });

  it('side view: on ledges of the reachable path, the dropoff past the source and a way back', () => {
    const rows = ['#'.repeat(60), ...Array.from({ length: 8 }, () => `#${'.'.repeat(58)}#`), '#'.repeat(60)];
    rows[8] = `#.S${'.'.repeat(56)}#`;
    const flat = level(rows);
    const dressed = dressStations(flat, 1, ctx('platformer', 1));
    const source = dressed.entities.find((e) => e.type === 'source')!;
    const drop = dressed.entities.find((e) => e.type === 'dropoff')!;
    expect(source.x - dressed.spawn.x).toBeGreaterThanOrEqual(2);
    expect(drop.x - source.x).toBeGreaterThanOrEqual(8);
    expect(checkStations(dressed, ctx('platformer', 1))).toEqual([]);
  });

  it('side view: a dropoff the player can drop down to but never climb back from is reported', () => {
    // A high shelf with the source, a deep pit beyond it with the dropoff at the bottom.
    const rows = [
      '##############################',
      '#............................#',
      '#............................#',
      '#.S.s........................#',
      '#########....................#',
      '#########....................#',
      '#########....................#',
      '#########....................#',
      '#########....................#',
      '#########....................#',
      '#########..........d.........#',
      '##############################',
    ];
    const issues = checkStations(room(rows), ctx('platformer', 1));
    expect(issues.map((i) => i.code)).toEqual(['station_one_way']);
  });
});
