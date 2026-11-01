import { MoveSet, SystemsJson, type BehaviourFsm, type LevelJson } from '@gg/schemas';
import { createSim, emptyInput, moveOf, moveTick, startMove, type InputState, type Sim } from '@gg/sdk';
import { KNIGHT_CLIPS, RECIPES, recipeForType } from '@gg/sdk/art';
import { levelTicksOf, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { validateMoves } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { AB_PREFIX, ABILITY_DASH, BLOCK_TICKS, BUFFER_TICKS, castle, DEFAULT_MOVES, FLASKS, GUARD, GUARD_BREAK_TICKS, GUARD_REFILL_TICKS, GUARDS, HURT_AIR_TICKS, HURT_TICKS, LOCK, OPEN_UNTIL, PARRY_STAGGER_TICKS, PLUNGE_BOUNCE } from './node.js';

/** A ghoul that stands where it is put: a target that keeps still. */
const STILL: BehaviourFsm = { version: 1, id: 'ghoul', designNotes: '', initial: 'stand', states: { stand: { onEnter: [{ kind: 'idle' }], update: [], transitions: [] } } };
/** A foe that stands where it is put: turned to face the hero as it starts, or left facing right (its back to a hero on its left). */
const stands = (id: string, facingHero: boolean): BehaviourFsm => ({
  version: 1,
  id,
  designNotes: '',
  initial: 'stand',
  states: { stand: { onEnter: [facingHero ? { kind: 'move_toward_player', speed: 0 } : { kind: 'idle' }], update: [], transitions: [] } },
});
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
const sentinel = (sim: Sim) => sim.world.entities.find((e) => e.type === 'sentinel')!;
/** Walks the hero right until a cut reaches the sentinel. */
const closeIn = (sim: Sim) => {
  for (let i = 0; i < 60 && sentinel(sim).x - (hero(sim).x + hero(sim).w) > 16; i++) step(sim, { right: true });
  step(sim, {}, 2);
};

describe('the castle sword', () => {
  it("ships moves that keep the rules: every foe's blow telegraphs, each move drawn with a clip of its owner's", () => {
    // The clips each of the cast is drawn with: the knight's rig for the hero, a recipe for the rest.
    const drawn = Object.fromEntries(castle.entityDefs.flatMap((d) => (RECIPES[recipeForType(d.type) ?? ''] ? [[d.type, Object.keys(RECIPES[recipeForType(d.type)!]!.anims)]] : [])));
    expect(DEFAULT_MOVES.moves.filter((m) => m.owner !== 'player' && drawn[m.owner] === undefined)).toEqual([]);
    const report = validateMoves(DEFAULT_MOVES, { types: castle.entityDefs.map((d) => d.type), clips: { ...drawn, player: KNIGHT_CLIPS.map((c) => c.name) } });
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

  it('lets a ghoul in reach raise its claws for 18 ticks, then rake: a hero who stands still is struck', () => {
    const sim = arena([{ type: 'ghoul', x: 7, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const g = ghouls(sim)[0]!;
    // Through the whole wind-up, by the claw's own clock, the hero is untouched; the next tick the rake lands.
    for (let i = 0; i < 240 && !(moveOf(g, MOVES)?.id === 'claw' && moveTick(g) === move('claw').startup); i++) step(sim, {});
    expect([moveOf(g, MOVES)?.id, hero(sim).hp]).toEqual(['claw', 5]);
    step(sim, {});
    expect(hero(sim).hp).toBe(4);
  });

  it("breaks a claw off with a cut in its wind-up: the ghoul staggers, its rake never comes", () => {
    const sim = arena([{ type: 'ghoul', x: 7, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const g = ghouls(sim)[0]!;
    for (let i = 0; i < 240 && moveOf(g, MOVES)?.id !== 'claw'; i++) step(sim, {});
    expect(moveOf(g, MOVES)?.id).toBe('claw');
    tap(sim, { action: true, right: true });
    step(sim, {}, 8);
    expect([moveOf(g, MOVES), (g.stunTicks ?? 0) > 0, g.anim]).toEqual([null, true, 'hurt']);
    step(sim, {}, 40);
    expect(hero(sim).hp).toBe(5);
  });

  it('lets a hound coil, then pounce at the hero jaws first', () => {
    const sim = arena([{ type: 'hound', x: 9, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const h = sim.world.entities.find((e) => e.type === 'hound')!;
    let started = -1;
    for (let i = 0; i < 180 && started < 0; i++) {
      step(sim, {});
      if (moveOf(h, MOVES)?.id === 'pounce') started = sim.tick;
    }
    expect(started).toBeGreaterThan(0);
    // Coiled through its wind-up, then in the air, coming at the hero.
    step(sim, {}, move('pounce').startup - 2);
    expect(h.grounded).toBe(true);
    step(sim, {}, 4);
    expect([h.grounded, h.vx < 0]).toEqual([false, true]);
  });

  it("lets a gargoyle's eyes blaze for half a second before it spits an ember", () => {
    const sim = arena([{ type: 'gargoyle', x: 12, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const gar = sim.world.entities.find((e) => e.type === 'gargoyle')!;
    const embers = () => sim.world.entities.filter((e) => e.type === 'ember');
    for (let i = 0; i < 240 && !(moveOf(gar, MOVES)?.id === 'spit' && moveTick(gar) === move('spit').startup); i++) step(sim, {});
    expect([moveOf(gar, MOVES)?.id, embers().length]).toEqual(['spit', 0]);
    step(sim, {});
    expect(embers().map((e) => e.vx < 0)).toEqual([true]);
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

describe("the sentinel's shield", () => {
  it('turns aside a cut from the front: the bearer unhurt, the cut over, the hero thrown back unhurt for a moment', () => {
    const sim = arena([{ type: 'sentinel', x: 5, y: 14, props: {} }], { behaviours: [stands('sentinel', true)] });
    const s = sentinel(sim);
    expect([s.facing, s.flags['guarding']]).toEqual([-1, true]);
    const blocks: number[] = [];
    sim.events.on('custom:block', () => blocks.push(sim.tick));
    tap(sim, { action: true, right: true });
    while (blocks.length === 0 && making(sim)) step(sim, {});
    expect(blocks).toHaveLength(1);
    expect([s.hp, making(sim), hero(sim).hp, hero(sim).vx < 0, hero(sim).props[LOCK], sim.world.hitstop! > 0]).toEqual([5, null, 5, true, 1, true]);
    step(sim, {}, BLOCK_TICKS + 4);
    expect(hero(sim).props[LOCK]).toBe(0);
  });

  it('does not cover its back, nor a plunge from over its head', () => {
    const back = arena([{ type: 'sentinel', x: 5, y: 14, props: {} }], { behaviours: [stands('sentinel', false)] });
    expect(sentinel(back).facing).toBe(1);
    tap(back, { action: true, right: true });
    while (making(back)) step(back, {});
    expect(sentinel(back).hp).toBe(4);

    const sim = arena([{ type: 'sentinel', x: 7, y: 14, props: {} }], { props: { [`${AB_PREFIX}double-jump`]: true }, behaviours: [stands('sentinel', true)] });
    const s = sentinel(sim);
    // Up over it: a jump and the air jump, drifting right until above it, then the plunge.
    for (let i = 0; i < 50 && Math.abs(hero(sim).x + 7 - (s.x + 10)) > 3; i++) step(sim, { right: true, jump: i < 12 || (i > 13 && i < 24) });
    step(sim, { down: true, action: true });
    expect(making(sim)).toBe('plunge');
    for (let i = 0; i < 60 && s.hp === 5; i++) step(sim, { down: true });
    expect(s.hp).toBe(5 - move('plunge').damage);
  });

  it(`gives by each blow it turns aside, and breaks at the third cut: the blow lands and the bearer reels ${GUARD_BREAK_TICKS} ticks`, () => {
    const sim = arena([{ type: 'sentinel', x: 7, y: 14, props: {} }], { behaviours: [stands('sentinel', true)] });
    const s = sentinel(sim);
    const events: string[] = [];
    for (const name of ['custom:block', 'custom:guard_break']) sim.events.on(name, () => events.push(name));
    for (let n = 0; n < 3; n++) {
      closeIn(sim);
      tap(sim, { action: true, right: true });
      while (making(sim)) step(sim, {});
      step(sim, {}, BLOCK_TICKS + 4);
    }
    expect(events).toEqual(['custom:block', 'custom:block', 'custom:guard_break']);
    expect([s.hp, s.props[GUARD], s.flags['guarding']]).toEqual([4, GUARDS['sentinel'], false]);
    expect(s.stunTicks).toBeGreaterThan(GUARD_BREAK_TICKS - 40);
  });

  it(`is whole again ${GUARD_REFILL_TICKS} ticks after its last block`, () => {
    const sim = arena([{ type: 'sentinel', x: 5, y: 14, props: {} }], { behaviours: [stands('sentinel', true)] });
    const s = sentinel(sim);
    tap(sim, { action: true, right: true });
    while (making(sim)) step(sim, {});
    expect(s.props[GUARD]).toBe(GUARDS['sentinel']! - move('cut').poise);
    step(sim, {}, GUARD_REFILL_TICKS);
    expect(s.props[GUARD]).toBe(GUARDS['sentinel']);
  });

  it('swings open as the bearer thrusts: raised through the wind-up, open from the first blow through the recovery', () => {
    const sim = arena([{ type: 'sentinel', x: 14, y: 14, props: {} }], { behaviours: [stands('sentinel', true)] });
    const s = sentinel(sim);
    const lunge = move('lunge');
    startMove(s, lunge);
    const raised: boolean[] = [];
    for (let i = 0; i < lunge.startup + lunge.active + lunge.recovery + 2; i++) {
      step(sim, {});
      raised.push(s.flags['guarding'] === true);
    }
    // Stepped from tick 0: raised while its clock is in the startup, open after, raised again once the thrust is over.
    expect(raised.slice(0, lunge.startup - 1).every(Boolean)).toBe(true);
    expect(raised.slice(lunge.startup, lunge.startup + lunge.active + lunge.recovery - 1).some(Boolean)).toBe(false);
    expect(raised.at(-1)).toBe(true);
    // A cut in the recovery lands: the hero, out of the thrust's reach, steps in as it ends.
    const again = arena([{ type: 'sentinel', x: 9, y: 14, props: {} }], { behaviours: [stands('sentinel', true)] });
    const t = sentinel(again);
    startMove(t, lunge);
    while (moveTick(t) < lunge.startup + lunge.active + 2) step(again, {});
    expect(t.flags['guarding']).toBe(false);
    hero(again).x = t.x - hero(again).w - 14;
    tap(again, { action: true, right: true });
    while (making(again)) step(again, {});
    expect([t.hp, hero(again).hp]).toEqual([4, 5]);
  });

  it('is beaten by the route bot unhurt, under both feels: in to its reach, out as it winds up, in to cut as it recovers', () => {
    for (const feelId of Object.keys(castle.feelPresets)) {
      const options = simOptionsFor(castle, SystemsJson.parse({ ...systemsJsonFor(castle), feelPreset: feelId }), { behaviours: castle.defaultBehaviours });
      const sim = createSim({ ...options, level: room([{ type: 'sentinel', x: 16, y: 14, props: {} }]), seed: 1 });
      const r = runBot(sim, castle.bots['route']!, 60 * 30);
      expect([feelId, r.completed, sim.world.player.hp, r.deaths]).toEqual([feelId, true, 5, 0]);
      expect(sim.world.entities.some((e) => e.type === 'sentinel')).toBe(false);
    }
  });
});

describe('the wraith and the bone archer', () => {
  it("lets a wraith's hands rise with the ghost-fire for 36 ticks before it casts a hex at the hero", () => {
    const sim = arena([{ type: 'wraith', x: 12, y: 13, props: {} }], { behaviours: castle.defaultBehaviours });
    const w = sim.world.entities.find((e) => e.type === 'wraith')!;
    const hexes = () => sim.world.entities.filter((e) => e.type === 'hex');
    for (let i = 0; i < 240 && !(moveOf(w, MOVES)?.id === 'hex' && moveTick(w) === move('hex').startup); i++) step(sim, {});
    expect([moveOf(w, MOVES)?.id, hexes().length, w.grounded]).toEqual(['hex', 0, false]);
    step(sim, {});
    expect(hexes().map((e) => e.vx < 0)).toEqual([true]);
  });

  it('fades through the hero, untouchable and harmless, and gathers again some 100 px on', () => {
    // A wraith that fades as it starts, turned toward the hero: the fade is a move its behaviour makes by playing the clip.
    const fades: BehaviourFsm = { version: 1, id: 'wraith', designNotes: '', initial: 'fade', states: { fade: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'fade' }], update: [], transitions: [] } } };
    const sim = arena([{ type: 'wraith', x: 7, y: 13, props: {} }], { behaviours: [fades] });
    const w = sim.world.entities.find((e) => e.type === 'wraith')!;
    expect(moveOf(w, MOVES)?.id).toBe('fade');
    const from = w.x + moveTick(w) * (move('fade').motion[0]!.vx / 60);
    // A cut as it drifts in: its body takes nothing, and it takes nothing from the hero as it passes through.
    tap(sim, { action: true, right: true });
    while (moveOf(w, MOVES)) step(sim, {});
    expect([w.hp, hero(sim).hp, from - w.x > 60]).toEqual([3, 5, true]);
    // Gathered again, a cut lands.
    hero(sim).x = w.x + w.w + 10;
    tap(sim, { action: true, left: true });
    while (making(sim)) step(sim, {});
    expect(w.hp).toBe(2);
  });

  it('lets a bone archer draw for 40 ticks, then loose an arrow low at the hero, and back away', () => {
    const sim = arena([{ type: 'bone-archer', x: 14, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const a = sim.world.entities.find((e) => e.type === 'bone-archer')!;
    const shafts = () => sim.world.entities.filter((e) => e.type === 'shaft');
    for (let i = 0; i < 240 && !(moveOf(a, MOVES)?.id === 'loose' && moveTick(a) === move('loose').startup); i++) step(sim, {});
    expect([moveOf(a, MOVES)?.id, shafts().length]).toEqual(['loose', 0]);
    step(sim, {});
    const [arrow] = shafts();
    expect([arrow!.vx < 0, arrow!.y + arrow!.h > hero(sim).y + hero(sim).h / 2]).toEqual([true, true]);
    // Loosed and recovered, it backs away from the hero.
    for (let i = 0; i < 90 && a.fsm?.state !== 'back'; i++) step(sim, {});
    step(sim, {}, 4);
    expect([a.fsm?.state, a.vx > 0]).toEqual(['back', true]);
  });

  it('cuts a shot out of the air', () => {
    const sim = arena([{ type: 'bone-archer', x: 14, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const shafts = () => sim.world.entities.filter((e) => e.type === 'shaft');
    for (let i = 0; i < 240 && shafts().length === 0; i++) step(sim, {});
    const arrow = shafts()[0]!;
    // Pressed as it comes within 60 px, the cut is out as it arrives.
    while (arrow.alive && arrow.x + arrow.w / 2 - (hero(sim).x + 7) > 60) step(sim, {});
    tap(sim, { action: true, right: true });
    step(sim, {}, 10);
    expect([arrow.alive, shafts().length, hero(sim).hp]).toEqual([false, 0, 5]);
  });
});

describe('defence and healing', () => {
  /** Steps until the ghoul's claw has run `t` ticks of its clock. */
  const clawAt = (sim: Sim, g: { props: Record<string, unknown> }, t: number) => {
    for (let i = 0; i < 300 && !(moveOf(g as never, MOVES)?.id === 'claw' && moveTick(g as never) === t); i++) step(sim, {});
  };

  it(`parries a claw timed over its blow: the hero untouched, the ghoul reeling ${PARRY_STAGGER_TICKS} ticks, and a riposte fells it`, () => {
    const sim = arena([{ type: 'ghoul', x: 7, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const g = ghouls(sim)[0]!;
    const parries: number[] = [];
    sim.events.on('custom:parry', () => parries.push(sim.tick));
    clawAt(sim, g, move('claw').startup - 4);
    tap(sim, { guard: true });
    expect(making(sim)).toBe('parry');
    step(sim, {}, 8);
    expect([parries.length, hero(sim).hp, moveOf(g, MOVES), (g.stunTicks ?? 0) > PARRY_STAGGER_TICKS - 20, Number(g.props[OPEN_UNTIL]) > sim.tick]).toEqual([1, 5, null, true, true]);
    // The attack key on a turned foe ahead is the riposte (pressed once the clash's hitstop is over): three hearts, the
    // whole of a ghoul.
    while ((sim.world.hitstop ?? 0) > 0) step(sim, {});
    tap(sim, { action: true, right: true });
    expect(making(sim)).toBe('riposte');
    while (making(sim)) step(sim, {});
    expect(ghouls(sim)).toEqual([]);
  });

  it('lets a blow through a parry made too soon, and makes the plain cut on a foe no parry turned', () => {
    const sim = arena([{ type: 'ghoul', x: 7, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const g = ghouls(sim)[0]!;
    clawAt(sim, g, 2);
    tap(sim, { guard: true });
    clawAt(sim, g, move('claw').startup + 2);
    expect(hero(sim).hp).toBe(4);
    const still = arena([{ type: 'ghoul', x: 5, y: 14, props: {} }]);
    tap(still, { action: true, right: true });
    expect(making(still)).toBe('cut');
  });

  it('drinks a flask: rooted, two hearts back as it tips after 40 ticks, the flask spent', () => {
    const sim = arena([]);
    hero(sim).hp = 2;
    const heals: number[] = [];
    sim.events.on('custom:heal', () => heals.push(sim.tick));
    tap(sim, { item: true });
    expect([making(sim), hero(sim).props[FLASKS], sim.world.hud[FLASKS]]).toEqual(['drink', 2, 2]);
    step(sim, { right: true }, move('drink').startup - 4);
    expect([hero(sim).hp, heals.length, Math.abs(hero(sim).vx) < 1]).toEqual([2, 0, true]);
    step(sim, {}, 6);
    expect([hero(sim).hp, heals.length]).toEqual([4, 1]);
    // At full hearts, or with none left, the key does nothing.
    while (making(sim)) step(sim, {});
    hero(sim).hp = hero(sim).maxHp;
    tap(sim, { item: true });
    expect(making(sim)).toBeNull();
  });

  it('spills a flask struck before it is drunk, and fills the flasks again at a rest', () => {
    const sim = arena([{ type: 'ghoul', x: 7, y: 14, props: {} }], { behaviours: castle.defaultBehaviours });
    const g = ghouls(sim)[0]!;
    hero(sim).hp = 3;
    // As the claw starts (its clock is 1 once a step has run it).
    clawAt(sim, g, 1);
    tap(sim, { item: true });
    expect(making(sim)).toBe('drink');
    step(sim, {}, move('drink').startup + 10);
    expect([hero(sim).hp, hero(sim).props[FLASKS]]).toEqual([2, 2]);
    // At an altar, a rest: the region loads again, the flasks full.
    const rest = arena([{ type: 'altar', x: 3, y: 14, props: {} }]);
    hero(rest).hp = 2;
    tap(rest, { item: true });
    while (making(rest)) step(rest, {});
    expect(hero(rest).props[FLASKS]).toBe(2);
    tap(rest, { up: true });
    step(rest, {}, 90);
    expect([hero(rest).props[FLASKS], rest.world.hud[FLASKS]]).toEqual([3, 3]);
  });

  it('slips a blow with the dash', () => {
    const sim = arena([{ type: 'ghoul', x: 7, y: 14, props: {} }], { behaviours: castle.defaultBehaviours, props: { [`${AB_PREFIX}${ABILITY_DASH}`]: true } });
    const g = ghouls(sim)[0]!;
    const dodges: number[] = [];
    sim.events.on('custom:dodge', () => dodges.push(sim.tick));
    clawAt(sim, g, move('claw').startup - 2);
    step(sim, { dash: true, right: true }, 3);
    step(sim, {}, 8);
    expect([hero(sim).hp, dodges.length > 0]).toEqual([5, true]);
  });
});

describe('played as a person would', () => {
  it('gets past every foe of the cast, late to see a wind-up and its parry sometimes off, under both feels', () => {
    for (const feelId of Object.keys(castle.feelPresets)) {
      const options = simOptionsFor(castle, SystemsJson.parse({ ...systemsJsonFor(castle), feelPreset: feelId }), { behaviours: castle.defaultBehaviours });
      for (const type of ['ghoul', 'hound', 'gargoyle', 'sentinel', 'wraith', 'bone-archer']) {
        // The wraith hovers a tile over the floor.
        const sim = createSim({ ...options, level: room([{ type, x: 16, y: type === 'wraith' ? 13 : 14, props: {} }]), seed: 1 });
        const r = runBot(sim, castle.bots['human']!, 60 * 30);
        expect([feelId, type, r.completed, r.deaths]).toEqual([feelId, type, true, 0]);
      }
    }
  });
});
