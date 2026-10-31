import { MoveSet, SystemsJson, type BehaviourFsm, type LevelJson } from '@gg/schemas';
import { createSim, emptyInput, moveOf, moveTick, type InputState, type Sim } from '@gg/sdk';
import { KNIGHT_CLIPS } from '@gg/sdk/art';
import { levelTicksOf, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { validateMoves } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { AB_PREFIX, BUFFER_TICKS, castle, DEFAULT_MOVES, HURT_AIR_TICKS, HURT_TICKS, LOCK, PLUNGE_BOUNCE } from './node.js';

/** A ghoul that stands where it is put: a target that keeps still. */
const STILL: BehaviourFsm = { version: 1, id: 'ghoul', designNotes: '', initial: 'stand', states: { stand: { onEnter: [{ kind: 'idle' }], update: [], transitions: [] } } };
const MOVES = new Map(DEFAULT_MOVES.moves.map((m) => [m.id, m]));
const move = (id: string) => MOVES.get(id)!;

/** One room 30 tiles wide, the floor under row 14, the hero at tile 3; `edit` changes columns. */
function room(entities: LevelJson['entities'], edit: (grid: string[][]) => void = () => {}): LevelJson {
  const grid = Array.from({ length: 17 }, (_, y) => Array.from({ length: 30 }, (_, x): string => (y === 0 || y >= 15 || x === 0 || x === 29 ? '#' : '.')));
  grid[14]![25] = 'G';
  edit(grid);
  const rows = grid.map((r) => r.join(''));
  return { version: 1, id: 'hall', name: 'Hall', tileSize: 16, width: 30, height: 17, legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal' }, rows, entities, rooms: [{ id: 'hall', x: 0, y: 0, w: 30, h: 17, kind: 'room' }], spawn: { x: 3, y: 14 }, goal: { x: 25, y: 14 } };
}

/** The castle with its foes standing still, in a room; the hero settled on the floor, with whatever abilities it is given. */
function arena(entities: LevelJson['entities'], opts: { props?: Record<string, boolean>; edit?: (grid: string[][]) => void; behaviours?: BehaviourFsm[]; at?: number } = {}): Sim {
  const options = simOptionsFor(castle, SystemsJson.parse(systemsJsonFor(castle)), { behaviours: opts.behaviours ?? [STILL] });
  const level = room(entities, opts.edit);
  const at = opts.at ?? 3;
  const sim = createSim({ ...options, level, seed: 1, resume: { at: { x: at * 16, y: 15 * 16 - 42 }, props: opts.props ?? {}, removed: [], tiles: [] } });
  step(sim, {}, 3);
  return sim;
}
const step = (sim: Sim, input: Partial<InputState>, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...input });
};
/** A press and a release: one tap of a key. */
const tap = (sim: Sim, input: Partial<InputState>) => {
  step(sim, input);
  step(sim, {});
};
const hero = (sim: Sim) => sim.world.player;
const making = (sim: Sim) => moveOf(hero(sim), MOVES)?.id ?? null;
const ghouls = (sim: Sim) => sim.world.entities.filter((e) => e.type === 'ghoul');

describe('the castle sword', () => {
  it("ships moves that keep the rules: every foe's blow telegraphs, each cut drawn with a clip of the knight's", () => {
    const report = validateMoves(DEFAULT_MOVES, { types: castle.entityDefs.map((d) => d.type), clips: { player: KNIGHT_CLIPS.map((c) => c.name) } });
    expect(report.issues).toEqual([]);
    expect(MoveSet.safeParse(DEFAULT_MOVES).success).toBe(true);
  });

  it('starts the chain on the attack key, and a press in each window goes on: the cut, the sweep, the thrust', () => {
    const sim = arena([{ type: 'ghoul', x: 24, y: 14, props: {} }]);
    tap(sim, { action: true });
    expect(making(sim)).toBe('cut');
    // In the cut's window (from its tick 9), a press goes on to the sweep; in the sweep's, to the thrust.
    while (moveTick(hero(sim)) < 9) step(sim, {});
    tap(sim, { action: true });
    expect(making(sim)).toBe('sweep');
    while (moveTick(hero(sim)) < 8) step(sim, {});
    tap(sim, { action: true });
    expect(making(sim)).toBe('thrust');
    // The thrust ends the chain; a press after it starts it over.
    while (making(sim)) step(sim, {});
    tap(sim, { action: true });
    expect(making(sim)).toBe('cut');
  });

  it(`holds a press made up to ${BUFFER_TICKS} ticks before a window for it, and drops one made sooner`, () => {
    const early = arena([]);
    tap(early, { action: true });
    while (moveTick(hero(early)) < 3) step(early, {});
    tap(early, { action: true });
    while (moveTick(hero(early)) < 23 && making(early) === 'cut') step(early, {});
    // Pressed at tick 4, five before the window: the sweep starts as the window opens.
    expect(making(early)).toBe('sweep');
    const sooner = arena([]);
    tap(sooner, { action: true });
    tap(sooner, { action: true });
    while (making(sooner) === 'cut') step(sooner, {});
    expect(making(sooner)).toBeNull();
  });

  it("roots the hero: held keys move it only by the cut's own step, and a jump waits for the cut to end", () => {
    const sim = arena([]);
    const x = hero(sim).x;
    step(sim, { action: true, right: true });
    for (let i = 0; i < 23; i++) step(sim, { right: true, jump: i === 2 });
    // The cut steps forward 40 px/s over its ticks 4 to 9: four pixels and a bit, no run, no jump.
    expect(hero(sim).x - x).toBeGreaterThan(3);
    expect(hero(sim).x - x).toBeLessThan(6);
    expect(hero(sim).grounded).toBe(true);
  });

  it("stops a cut's step at a ledge: the thrust's lunge never carries the hero into a pit", () => {
    // A pit right before the hero's toes; it faces it and thrusts.
    const sim = arena([], {
      at: 5,
      edit: (g) => {
        for (const y of [15, 16]) for (const x of [7, 8, 9]) g[y]![x] = '.';
      },
    });
    tap(sim, { action: true, right: true });
    while (moveTick(hero(sim)) < 9) step(sim, {});
    tap(sim, { action: true });
    while (moveTick(hero(sim)) < 8) step(sim, {});
    tap(sim, { action: true });
    expect(making(sim)).toBe('thrust');
    while (making(sim)) step(sim, {});
    expect([hero(sim).grounded, Math.round(hero(sim).y + hero(sim).h)]).toEqual([true, 15 * 16]);
  });

  it('strikes a foe once a cut: hurt, thrown back, staggered, the world held a moment; the chain fells a ghoul', () => {
    const sim = arena([{ type: 'ghoul', x: 5, y: 14, props: {} }]);
    const g = ghouls(sim)[0]!;
    const hits: number[] = [];
    sim.events.on('hit', (ev) => ev.payload['target'] === g.id && hits.push(sim.tick));
    tap(sim, { action: true, right: true });
    while (moveTick(hero(sim)) <= move('cut').startup) step(sim, {});
    expect(hits).toHaveLength(1);
    expect([g.hp, g.vx > 0, (g.stunTicks ?? 0) > 0, sim.world.hitstop! > 0]).toEqual([2, true, true, true]);
    let fell = -1;
    sim.events.on('death', (ev) => ev.payload['entity'] === g.id && (fell = sim.tick));
    for (let i = 0; i < 120 && fell < 0; i++) step(sim, { action: i % 2 === 0, right: true });
    expect(fell).toBeGreaterThan(0);
    expect(ghouls(sim)).toEqual([]);
  });

  it('cuts overhead in the air, and with down plunges: the plunge bounces the hero off a foe it strikes', () => {
    const air = arena([]);
    step(air, { jump: true }, 6);
    tap(air, { action: true });
    expect(making(air)).toBe('aircut');

    const sim = arena([{ type: 'ghoul', x: 6, y: 14, props: {} }], { props: { [`${AB_PREFIX}double-jump`]: true } });
    const g = ghouls(sim)[0]!;
    // Up over the ghoul: a jump and the air jump, drifting right until above it.
    for (let i = 0; i < 40 && Math.abs(hero(sim).x + 7 - (g.x + 8)) > 3; i++) step(sim, { right: true, jump: i < 12 || (i > 13 && i < 24) });
    step(sim, { down: true, action: true });
    expect(making(sim)).toBe('plunge');
    let bounced = false;
    for (let i = 0; i < 60 && !bounced; i++) {
      step(sim, { down: true });
      bounced = hero(sim).vy < 0 && g.hp < 3;
    }
    expect(bounced).toBe(true);
    expect(g.hp).toBe(3 - move('plunge').damage);
    expect(hero(sim).vy).toBeLessThanOrEqual(PLUNGE_BOUNCE + 60);
  });

  it('lets a dash cut a cut short only from its dash-cancel tick', () => {
    const sim = arena([], { props: { [`${AB_PREFIX}dash`]: true } });
    tap(sim, { action: true });
    while (moveTick(hero(sim)) < 5) step(sim, {});
    tap(sim, { dash: true });
    expect([making(sim), hero(sim).props[LOCK]]).toEqual(['cut', 1]);
    while (moveTick(hero(sim)) < move('cut').dashCancel!) step(sim, {});
    expect(hero(sim).props[LOCK]).toBe(2);
    tap(sim, { dash: true });
    expect([making(sim), hero(sim).flags['dashing']]).toEqual([null, true]);
  });

  it('throws the hero back from a blow, reeling: no cut and no control for a while, less in the air', () => {
    // A ghoul that walks into the hero.
    const toward: BehaviourFsm = { version: 1, id: 'ghoul', designNotes: '', initial: 'go', states: { go: { onEnter: [], update: [{ kind: 'move_toward_player', speed: 60 }], transitions: [] } } };
    const sim = arena([{ type: 'ghoul', x: 7, y: 14, props: {} }], { behaviours: [toward] });
    let struck = -1;
    sim.events.on('hit', (ev) => ev.payload['target'] === hero(sim).id && struck < 0 && (struck = sim.tick));
    for (let i = 0; i < 120 && struck < 0; i++) step(sim, {});
    expect(struck).toBeGreaterThan(0);
    expect([hero(sim).hp, hero(sim).vx < 0, hero(sim).props[LOCK]]).toEqual([4, true, 1]);
    // Reeling: the attack key does nothing, the arrows do nothing.
    tap(sim, { action: true, right: true });
    expect(making(sim)).toBeNull();
    step(sim, { right: true }, HURT_TICKS - 3);
    expect(hero(sim).props[LOCK]).toBe(1);
    step(sim, { right: true }, 2);
    expect(hero(sim).props[LOCK]).toBe(0);
    expect(HURT_AIR_TICKS).toBeLessThan(HURT_TICKS);
  });

  it('fells the foes on the way: the route bot wins a region cutting its foes down', () => {
    const level = castle.levelGrammar.generate({ seed: 1, difficulty: 0.5 });
    const options = simOptionsFor(castle, SystemsJson.parse(systemsJsonFor(castle)), { behaviours: castle.defaultBehaviours });
    const sim = createSim({ ...options, level, seed: 1 });
    const foes = new Set(castle.entityDefs.filter((d) => d.fsm).map((d) => d.type));
    let felled = 0;
    sim.events.on('death', (ev) => foes.has(String(ev.payload['type'])) && felled++);
    const r = runBot(sim, castle.bots['route']!, levelTicksOf(options));
    expect(r.completed).toBe(true);
    expect(felled).toBeGreaterThanOrEqual(3);
  });
});
