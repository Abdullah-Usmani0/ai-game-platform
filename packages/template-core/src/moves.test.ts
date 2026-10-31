import { MoveSet, type BehaviourFsm, type LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, emptyInput, type Entity, type InputState, type Sim, type SimCtx } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { cancelInto, cancelOpensWithin, hitboxesAt, moveMap, moveOf, movePhase, moveTick, POISE, POISE_MAX, startMove, stepMove, type Strike } from './moves.js';
import { level } from './test-games.js';

const SET = MoveSet.parse({
  version: 1,
  moves: [
    // A cut: 4 ticks of wind-up, 3 that hit (a box 24 px ahead of the middle), 6 of recovery; chains into a second cut.
    { id: 'cut', owner: 'player', anim: 'attack1', input: 'attack', startup: 4, active: 3, recovery: 6, hitboxes: [{ from: 0, to: 2, x: 2, y: -8, w: 24, h: 8 }], damage: 1, knockback: { x: 120, y: -60 }, hitstun: 10, hitstop: 3, poise: 10, cancels: [{ into: ['cut2'], from: 5, to: 10 }] },
    { id: 'cut2', owner: 'player', anim: 'attack2', input: 'attack', startup: 3, active: 2, recovery: 8, hitboxes: [{ from: 0, to: 1, x: 2, y: -8, w: 24, h: 8 }], damage: 1, knockback: { x: 160, y: -80 }, hitstun: 14, hitstop: 0, poise: 10 },
    { id: 'lunge', owner: 'player', anim: 'attack3', input: 'riposte', startup: 2, active: 4, recovery: 4, hitboxes: [], damage: 0, knockback: { x: 0, y: 0 }, hitstun: 0, hitstop: 0, motion: [{ from: 0, to: 5, vx: 240, vy: -120 }] },
    { id: 'dive', owner: 'player', anim: 'plunge', input: 'plunge', startup: 2, active: 30, recovery: 6, hitboxes: [{ from: 0, to: 29, x: -6, y: -4, w: 12, h: 8 }], damage: 1, knockback: { x: 40, y: -60 }, hitstun: 6, hitstop: 0, endsOnLanding: true, motion: [{ from: 2, to: 2, vx: 0, vy: 300 }] },
    { id: 'spit', owner: 'dummy', anim: 'aim', startup: 12, active: 1, recovery: 10, hitboxes: [], damage: 1, knockback: { x: 0, y: 0 }, hitstun: 0, hitstop: 0, projectile: { type: 'ember', at: 12, speed: 120 } },
  ],
});
const MOVES = moveMap(SET);
const move = (id: string) => MOVES.get(id)!;

/** Paces one way, then the other, every 300 ms. */
const PACE: BehaviourFsm = {
  version: 1,
  id: 'pace',
  designNotes: '',
  initial: 'left',
  states: {
    left: { onEnter: [], update: [{ kind: 'patrol', speed: 30 }], transitions: [{ to: 'right', when: { kind: 'timer_elapsed', ms: 300 } }] },
    right: { onEnter: [], update: [{ kind: 'patrol', speed: 30 }], transitions: [{ to: 'left', when: { kind: 'timer_elapsed', ms: 300 } }] },
  },
};

/** A hall 40 tiles long of 8 px tiles, the player at tile 4, dummies on the floor at the given tiles. */
function hall(dummies: number[], spawnY = 14): LevelJson {
  const rows = Array.from({ length: 16 }, (_, y) => Array.from({ length: 40 }, (_, x) => (y === 15 || x === 0 || x === 39 ? '#' : y === spawnY && x === 4 ? 'S' : '.')).join(''));
  return { ...level(rows), entities: dummies.map((x) => ({ type: 'dummy', x, y: 14, props: {} })) };
}

/** A sim whose one system runs `drive` each tick, with the player's body under gravity; strikes are kept by tick. */
function arena(dummies: number[], drive: (input: InputState, ctx: SimCtx, strikes: Array<Strike & { tick: number }>) => void, opts: { pace?: boolean; spawnY?: number } = {}): Sim & { strikes: Array<Strike & { tick: number }> } {
  const strikes: Array<Strike & { tick: number }> = [];
  const driver = defineSystem<null>({
    id: 'driver',
    init: () => null,
    fixedUpdate(_s, input, ctx) {
      drive(input, ctx, strikes);
      const p = ctx.world.player;
      p.vy = Math.min(p.vy + ctx.feel.gravity * ctx.dt, ctx.feel.maxFall);
      ctx.move(p, p.vx * ctx.dt, p.vy * ctx.dt);
      if (!moveOf(p, MOVES)) p.vx = 0;
    },
  });
  const sim = createSim({
    feel: CELESTE_CLASS,
    systems: [driver],
    level: hall(dummies, opts.spawnY),
    seed: 1,
    entityDefs: [
      { type: 'dummy', w: 8, h: 8, hp: 9, gravity: true, ...(opts.pace ? { fsm: 'pace' } : {}), contactDamage: 0 },
      { type: 'ember', w: 4, h: 4, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
    ],
    behaviours: [PACE],
    player: { w: 6, h: 8, hp: 3 },
  });
  return Object.assign(sim, { strikes });
}

/** The player's move stepped each tick against the dummies; `start` begins it on the first tick. */
const swing = (start: string | null) => (_input: InputState, ctx: SimCtx, strikes: Array<Strike & { tick: number }>) => {
  const p = ctx.world.player;
  if (start && ctx.tick === 0) startMove(p, move(start));
  const m = moveOf(p, MOVES);
  if (m) for (const s of stepMove(ctx, p, m, ctx.world.entities.filter((e) => e.type === 'dummy'))) strikes.push({ ...s, tick: ctx.tick });
};
const run = (sim: Sim, ticks: number, keys: Partial<InputState> = {}) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...keys });
};
const dummies = (sim: Sim): Entity[] => sim.world.entities.filter((e) => e.type === 'dummy');

describe('moves', () => {
  it('knows where a move is, and places its boxes ahead of its owner whichever way it faces', () => {
    const cut = move('cut');
    expect([0, 3, 4, 6, 7, 12, 13].map((t) => movePhase(cut, t))).toEqual(['startup', 'startup', 'active', 'active', 'recovery', 'recovery', 'done']);
    const owner = { x: 100, y: 50, w: 6, h: 8, facing: 1 };
    expect(hitboxesAt(cut, 3, owner)).toEqual([]);
    expect(hitboxesAt(cut, 4, owner)).toEqual([{ x: 105, y: 50, w: 24, h: 8 }]);
    expect(hitboxesAt(cut, 4, { ...owner, facing: -1 })).toEqual([{ x: 77, y: 50, w: 24, h: 8 }]);
    expect(hitboxesAt(cut, 7, owner)).toEqual([]);
  });

  it('hits only while active, each target once, and the blow throws them back', () => {
    const sim = arena([6, 7], swing('cut'));
    run(sim, 20);
    // Both dummies stand in the box from its first active tick (4) to its last (6): each is struck once, at 4.
    expect(sim.strikes.map((s) => [s.tick, s.target.id, s.landed, s.staggered])).toEqual(dummies(sim).map((d) => [4, d.id, true, true]));
    expect(dummies(sim).map((d) => d.hp)).toEqual([8, 8]);
    expect(moveOf(sim.world.player, MOVES)).toBeNull();
  });

  it('faces its owner: a cut to the left misses what stands to the right', () => {
    const sim = arena([6], (input, ctx, strikes) => {
      if (ctx.tick === 0) ctx.world.player.facing = -1;
      swing('cut')(input, ctx, strikes);
    });
    run(sim, 20);
    expect(sim.strikes).toEqual([]);
  });

  it('staggers a foe: its behaviour holds and its body slides to a stop, then it goes on', () => {
    const sim = arena([6], swing('cut'), { pace: true });
    run(sim, 4);
    const d = dummies(sim)[0]!;
    const state = d.fsm!.state;
    // The blow's own tick is the first of the ten its behaviour holds.
    run(sim, 1);
    expect(d.stunTicks).toBe(9);
    // The hitstop (3 ticks) holds everything, then the stagger counts down while the body slides.
    run(sim, 3);
    expect(d.stunTicks).toBe(9);
    const speeds: number[] = [];
    for (let i = 0; i < 9; i++) {
      run(sim, 1);
      speeds.push(Math.abs(d.vx));
      expect(d.fsm!.state).toBe(state);
    }
    expect(speeds.every((v, i) => i === 0 || v <= speeds[i - 1]!)).toBe(true);
    expect(d.stunTicks).toBe(0);
    // Steady again, it paces on: it turns within its 300 ms.
    const states = new Set<string>();
    for (let i = 0; i < 20; i++) {
      run(sim, 1);
      states.add(d.fsm!.state);
    }
    expect(states.size).toBe(2);
  });

  it('holds the world still for the hitstop, while the clock and the inputs go on', () => {
    const sim = arena([6], swing('cut'), { pace: true });
    run(sim, 5);
    expect(sim.world.hitstop).toBe(3);
    const d = dummies(sim)[0]!;
    const at = { x: d.x, y: d.y, tick: moveTick(sim.world.player), entered: d.fsm!.enteredTick };
    const tick = sim.tick;
    run(sim, 3, { left: true });
    expect([d.x, d.y, moveTick(sim.world.player)]).toEqual([at.x, at.y, at.tick]);
    // Its behaviour's clock is held too: it entered its state three ticks later, as far as it can tell.
    expect(d.fsm!.enteredTick).toBe(at.entered + 3);
    expect([sim.tick, sim.world.hitstop]).toEqual([tick + 3, 0]);
    expect(sim.inputLog().some((f) => f.tick === tick && f.input.left)).toBe(true);
    run(sim, 1);
    expect(moveTick(sim.world.player)).toBe(at.tick + 1);
  });

  it('lets a poised foe take blows without flinching until its poise breaks, then fills it again', () => {
    const sim = arena([6], (input, ctx, strikes) => {
      const p = ctx.world.player;
      if (ctx.tick === 0) for (const d of ctx.world.entities.filter((e) => e.type === 'dummy')) Object.assign(d.props, { [POISE]: 15, [POISE_MAX]: 15 });
      if (ctx.tick === 0 || ctx.tick === 30) startMove(p, move('cut'));
      swing(null)(input, ctx, strikes);
    });
    run(sim, 60);
    const d = dummies(sim)[0]!;
    expect(sim.strikes.map((s) => [s.landed, s.staggered])).toEqual([
      [true, false],
      [true, true],
    ]);
    expect([d.hp, d.props[POISE]]).toEqual([7, 15]);
  });

  it('chains: a press inside a cancel window starts the next move, and one just before it is held for it', () => {
    const cut = move('cut');
    const any = () => true;
    expect([4, 5, 10, 11].map((t) => cancelInto(cut, t, MOVES, any)?.id ?? null)).toEqual([null, 'cut2', 'cut2', null]);
    expect(cancelInto(cut, 6, MOVES, (m) => m.input === 'air')).toBeNull();
    expect([cancelOpensWithin(cut, 0, 6), cancelOpensWithin(cut, 0, 4), cancelOpensWithin(cut, 5, 6)]).toEqual([true, false, false]);
  });

  it('carries its owner by its own motion, and looses its shot at its tick from the front', () => {
    const sim = arena([20], swing('lunge'));
    const x = sim.world.player.x;
    run(sim, 1);
    expect([sim.world.player.vx, sim.world.player.vy]).toEqual([240, -120 + CELESTE_CLASS.gravity / 60]);
    run(sim, 5);
    expect(sim.world.player.x).toBeGreaterThan(x + 15);

    const foe = arena([20], (_input, ctx) => {
      const d = ctx.world.entities.find((e) => e.type === 'dummy')!;
      if (ctx.tick === 0) {
        d.facing = -1;
        startMove(d, move('spit'));
      }
      const m = moveOf(d, MOVES);
      if (m) stepMove(ctx, d, m, [ctx.world.player]);
    });
    run(foe, 12);
    expect(foe.world.entities.some((e) => e.type === 'ember')).toBe(false);
    run(foe, 1);
    const d = dummies(foe)[0]!;
    const ember = foe.world.entities.find((e) => e.type === 'ember')!;
    // Loosed at the foe's front, then a tick of flight.
    expect([ember.vx, ember.x + ember.w]).toEqual([-120, d.x - 2]);
  });

  it('ends a plunge as its owner lands: straight to its recovery', () => {
    // Five tiles up: the fall (the feel caps it at 160 px/s) is over well inside the plunge's 30 active ticks.
    const sim = arena([], swing('dive'), { spawnY: 9 });
    run(sim, 3);
    expect(sim.world.player.grounded).toBe(false);
    let landed = -1;
    for (let i = 0; i < 40 && landed < 0; i++) {
      run(sim, 1);
      if (sim.world.player.grounded) landed = sim.tick;
    }
    expect(landed).toBeGreaterThan(0);
    // The tick after the landing turns the clock to the recovery's first tick, and the six of it end the move.
    expect(moveTick(sim.world.player)).toBeLessThan(move('dive').startup + move('dive').active);
    run(sim, 1);
    expect(moveTick(sim.world.player)).toBe(move('dive').startup + move('dive').active);
    run(sim, 5);
    expect(moveOf(sim.world.player, MOVES)).not.toBeNull();
    run(sim, 1);
    expect(moveOf(sim.world.player, MOVES)).toBeNull();
  });

  it('keeps its clock in the save: a sim loaded mid-move plays on exactly as before', () => {
    const a = arena([6, 7], swing('cut'), { pace: true });
    run(a, 3);
    const save = a.save();
    run(a, 30);
    const end = a.hash();
    a.load(save);
    run(a, 30);
    expect(a.hash()).toBe(end);
  });
});
