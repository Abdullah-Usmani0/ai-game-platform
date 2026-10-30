import type { LevelJson, Objectives } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type Sim, type SimOptions } from '@gg/sdk';
import { checkComposition, type CatalogSystem } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { explore } from './explore.js';
import { meta as movementMeta } from './systems/movement-topdown.js';
import { objectives, meta as objectivesMeta } from './systems/objectives.js';
import { pickups, meta as pickupsMeta } from './systems/pickups.js';
import { level, walker } from './test-games.js';

/** Action smashes everything within 14 px that is not a pickup: foes and pots alike. */
const smite = defineSystem<{ prev: boolean }>({
  id: 'smite',
  init: () => ({ prev: false }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    if (input.action && !s.prev) for (const e of ctx.world.entities) if (!e.isPlayer && e.alive && !e.pickup && Math.hypot(e.x - p.x, e.y - p.y) < 14) ctx.damage(e, 99, p);
    s.prev = input.action;
  },
});
/** Spikes hurt (no respawn of its own: the objectives decide). */
const spikes = defineSystem<null>({
  id: 'spikes',
  init: () => null,
  fixedUpdate(_s, _input, ctx) {
    const p = ctx.world.player;
    if (p.alive && ctx.map.isHazard(p.x, p.y, p.w, p.h)) ctx.damage(p, 99, null);
  },
});

const defs: SimOptions['entityDefs'] = [
  { type: 'coin', w: 6, h: 6, gravity: false, pickup: true },
  { type: 'slime', w: 8, h: 8, gravity: false, contactDamage: 1 },
  { type: 'pot', w: 8, h: 8, gravity: false },
];
const KINDS: Record<string, string> = { o: 'coin', x: 'slime', p: 'pot' };
/** A level from rows, with coins 'o', slimes 'x' and pots 'p' standing on air. */
function room(rows: string[]): LevelJson {
  const l = level(rows);
  const entities = rows.flatMap((r, y) => [...r].flatMap((ch, x) => (KINDS[ch] ? [{ type: KINDS[ch]!, x, y, props: {} }] : [])));
  return { ...l, entities, legend: { ...l.legend, o: 'air', x: 'air', p: 'air' } };
}
/** Spawn at the left, the goal at the right, coins and slimes between, spikes along the bottom. */
const ROOM = room(['############', '#S..o..x..G#', '#..........#', '#..x...o...#', '#^^^^^^^^^^#', '############']);

const game = (rules: Objectives, lvl = ROOM) => (): Sim =>
  createSim({ level: lvl, feel: CELESTE_CLASS, seed: 1, systems: [walker, smite, spikes, pickups, objectives], entityDefs: defs, player: { w: 8, h: 8, hp: 1 }, movementMode: 'topdown', content: { objectives: rules } });
const win = (mode: 'all' | 'any', ...clauses: Objectives['win']['clauses']): Objectives => ({ version: 1, win: { mode, clauses }, lose: [] });

describe('objectives', () => {
  it('reach the goal, collect, defeat: each clause, all of them or any one', () => {
    expect(explore(game(win('all', { kind: 'reach_goal' })), { budget: 20_000 }).completed).toBe(true);
    const everything = game(win('all', { kind: 'reach_goal' }, { kind: 'collect', type: 'coin', count: 2 }, { kind: 'defeat', count: 'all' }));
    const r = explore(everything, { budget: 20_000 });
    expect(r.completed).toBe(true);
    const done = everything();
    done.run(r.script!, r.ticks);
    expect(done.world.flags.won).toBe(true);
    expect(done.events.count('pickup')).toBe(2);
    expect(done.world.entities.filter((e) => e.type === 'slime' && e.alive)).toHaveLength(0);
    // Any: one coin is enough, long before the goal.
    const a = explore(game(win('any', { kind: 'reach_goal' }, { kind: 'collect', count: 1 })), { budget: 20_000 });
    expect(a.completed).toBe(true);
    expect(a.ticks).toBeLessThan(r.ticks);
  });

  it('a smashed pot is not a defeated foe', () => {
    const sim = game(win('all', { kind: 'defeat', count: 1 }), room(['#######', '#Sp..x#', '#######']))();
    sim.step({ ...emptyInput(), action: true });
    sim.step(emptyInput());
    expect(sim.events.count('death')).toBe(1);
    expect(sim.world.flags.won).toBe(false);
    expect(sim.world.hud['defeated']).toBe('0/1');
    // Close enough to strike the slime, not to touch it.
    sim.run([{ from: sim.tick, to: sim.tick + 20, input: { right: true } }], 20);
    sim.step({ ...emptyInput(), action: true });
    sim.step(emptyInput());
    expect(sim.world.player.alive).toBe(true);
    expect(sim.world.flags.won).toBe(true);
    expect(sim.world.hud['defeated']).toBe('1/1');
  });

  it('shows a count up to its target and no further', () => {
    // Two coins on the way to the goal, one asked for: past it the HUD still reads 1/1.
    const sim = game(win('all', { kind: 'reach_goal' }, { kind: 'collect', type: 'coin', count: 1 }), room(['#########', '#S.o.o.G#', '#########']))();
    sim.run([{ from: 0, to: 120, input: { right: true } }], 120);
    expect(sim.events.count('pickup')).toBe(2);
    expect(sim.world.hud['collected']).toBe('1/1');
  });

  it('survive: the clock runs only while the game does, so a menu does not eat it', () => {
    const rules = win('all', { kind: 'survive', seconds: 5 });
    const plain = game(rules)();
    for (let i = 0; i < 1000 && !plain.world.flags.won; i++) plain.step(emptyInput());
    const menu = defineSystem<null>({ id: 'menu', init: () => null, fixedUpdate: (_s, _i, ctx) => (ctx.tick === 60 ? ctx.openMenu({ id: 'm', title: 'M', options: [{ id: 'a', label: 'A' }] }) : undefined) });
    const held = createSim({ ...game(rules)().options, systems: [walker, menu, objectives] });
    for (let i = 0; i < 1000 && !held.world.flags.won; i++) held.step(i >= 200 && i < 204 ? { ...emptyInput(), action: true } : emptyInput());
    expect(plain.world.flags.won).toBe(true);
    expect(held.world.flags.won).toBe(true);
    expect(held.tick - plain.tick).toBeGreaterThan(130);
  });

  it('loses when time runs out, and when the lives do, respawning until then', () => {
    const late = game({ ...win('all', { kind: 'collect', count: 9 }), lose: [{ kind: 'time_out', seconds: 5 }] })();
    for (let i = 0; i < 400 && !late.world.flags.gameOver; i++) late.step(emptyInput());
    expect(late.world.flags.gameOver).toBe(true);
    expect(late.tick).toBeLessThan(310);
    // Walking down into the spikes over and over: two lives.
    const lives = game({ ...win('all', { kind: 'reach_goal' }), lose: [{ kind: 'lives', count: 2 }] })();
    for (let i = 0; i < 600 && !lives.world.flags.gameOver; i++) lives.step({ ...emptyInput(), down: true });
    expect(lives.world.flags.gameOver).toBe(true);
    expect(lives.world.deaths).toBe(2);
    expect(lives.events.history().filter((e) => e.name === 'spawn' && e.payload['type'] === 'player')).toHaveLength(1);
  });

  it('progress is the mean of the clauses (all) or the furthest (any)', () => {
    const half = game(win('all', { kind: 'survive', seconds: 10 }, { kind: 'collect', count: 4 }))();
    for (let i = 0; i < 300; i++) half.step(emptyInput());
    expect(half.progress()).toBeCloseTo((0.5 + 0) / 2, 2);
    const anyHalf = game(win('any', { kind: 'survive', seconds: 10 }, { kind: 'collect', count: 4 }))();
    for (let i = 0; i < 300; i++) anyHalf.step(emptyInput());
    expect(anyHalf.progress()).toBeCloseTo(0.5, 2);
  });

  it('composes as the one win and death owner of a game', () => {
    const metas: CatalogSystem[] = [movementMeta, pickupsMeta, objectivesMeta];
    expect(checkComposition(metas, { roles: ['hostile', 'collectible'], content: ['objectives'] }).issues).toEqual([]);
    expect(checkComposition([metas[0]!, metas[2]!], { roles: [], content: [] }).issues.map((i) => i.code)).toEqual(['missing_content']);
  });
});
