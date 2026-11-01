import { MoveSet, SystemsJson, type BehaviourFsm, type LevelJson } from '@gg/schemas';
import {
  centerX,
  createSim,
  emptyInput,
  moveOf,
  moveTick,
  POISE,
  type Entity,
  type InputState,
  type Sim,
} from '@gg/sdk';
import { runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { BOSS_POISE, castle, DEFAULT_MOVES, HEADSMAN_TYPE } from './node.js';

const MOVES = new Map(DEFAULT_MOVES.moves.map((m) => [m.id, m]));
const move = (id: string) => MOVES.get(id)!;
/** The boss's room: the second of three, its doorways in its edge columns. */
const ARENA = { x: 30, w: 30 };
const DOOR_ROW = 13;

/**
 * Three rooms in a row, a doorway between each: the start, the boss's room (the headsman kneeling two thirds of the way
 * across) and the way out; altars at the given columns.
 */
function bossLevel(altars: number[] = []): LevelJson {
  const W = 90;
  const H = 17;
  const grid = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x): string =>
      y === 0 || y >= 15 || x === 0 || x === W - 1 ? '#' : '.',
    ),
  );
  for (const wx of [29, 59]) for (let y = 1; y < 11; y++) grid[y]![wx] = '#';
  grid[14]![85] = 'G';
  return {
    version: 1,
    id: 'arena',
    name: 'Arena',
    tileSize: 16,
    width: W,
    height: H,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal' },
    rows: grid.map((r) => r.join('')),
    entities: [
      { type: HEADSMAN_TYPE, x: 49, y: 14, props: { name: 'The Headsman' } },
      ...altars.map((x) => ({ type: 'altar', x, y: 14, props: {} })),
    ],
    rooms: [
      { id: 'start', x: 0, y: 0, w: 30, h: H, kind: 'save' },
      { id: 'boss', x: ARENA.x, y: 0, w: ARENA.w, h: H, kind: 'boss' },
      { id: 'exit', x: 60, y: 0, w: 30, h: H, kind: 'exit' },
    ],
    spawn: { x: 5, y: 14 },
    goal: { x: 85, y: 14 },
  };
}

/** The castle with its own behaviours (or the boss's given one), the hero standing at column `at`. */
function fight(
  opts: { at?: number; altars?: number[]; feel?: string; behaviours?: BehaviourFsm[]; moves?: MoveSet } = {},
): Sim {
  const options = simOptionsFor(
    castle,
    SystemsJson.parse({ ...systemsJsonFor(castle), feelPreset: opts.feel ?? castle.defaultFeel }),
    {
      behaviours: [
        ...castle.defaultBehaviours.filter((b) => !opts.behaviours?.some((o) => o.id === b.id)),
        ...(opts.behaviours ?? []),
      ],
      ...(opts.moves ? { content: { moves: opts.moves } } : {}),
    },
  );
  const level = bossLevel(opts.altars);
  if (opts.at === undefined) return createSim({ ...options, level, seed: 1 });
  return createSim({
    ...options,
    level,
    seed: 1,
    resume: { at: { x: opts.at * 16, y: 15 * 16 - 42 }, props: {}, removed: [], tiles: [] },
  });
}
const step = (sim: Sim, input: Partial<InputState>, ticks = 1) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...input });
};
const boss = (sim: Sim): Entity | undefined =>
  sim.world.entities.find((e) => e.type === HEADSMAN_TYPE);
const hero = (sim: Sim) => sim.world.player;
/** Steps (with `input`) until `done` holds, `max` ticks at most; true if it did. */
const until = (sim: Sim, done: () => boolean, max: number, input: Partial<InputState> = {}) => {
  for (let i = 0; i < max && !done(); i++) step(sim, input);
  return done();
};
/** The custom events the arena and the boss announce, as `tick:name`. */
const announced = (sim: Sim) => {
  const log: string[] = [];
  sim.events.on('*', (ev) => {
    if (
      [
        'custom:boss',
        'custom:enrage',
        'custom:arena_shut',
        'custom:arena_open',
        'custom:rest',
      ].includes(ev.name)
    )
      log.push(ev.name.slice(7));
  });
  return log;
};
const doors = (sim: Sim) => [
  sim.map.kindAt(ARENA.x, DOOR_ROW),
  sim.map.kindAt(ARENA.x + ARENA.w - 1, DOOR_ROW),
];
/** The route bot on, until `done` or `max` ticks. */
const botUntil = (sim: Sim, done: () => boolean, max: number) => {
  const mem: Record<string, number> = {};
  for (let t = 0; t < max && !done(); t++) sim.step(castle.bots['route']!(sim, t, mem));
  return done();
};
/** Leaves the boss one blow from falling, in its first phase (its roar spent). */
const lastBlow = (b: Entity) => {
  b.hp = 1;
  b.flags['enraged'] = true;
};

describe('the headsman', () => {
  it('kneels until the hero comes near, then rises untouchable, names itself and shuts its doorways', () => {
    const sim = fight();
    const log = announced(sim);
    expect(until(sim, () => log.includes('arena_shut'), 60 * 20, { right: true })).toBe(true);
    const b = boss(sim)!;
    // It rose as the hero came near, and the doorways shut once the hero was two tiles inside.
    expect(log).toEqual(['boss', 'arena_shut']);
    expect([b.props['name'], b.flags['boss'], b.props[POISE]]).toEqual([
      'The Headsman',
      true,
      BOSS_POISE,
    ]);
    expect(doors(sim)).toEqual(['solid', 'solid']);
    expect(Math.floor((hero(sim).x + hero(sim).w / 2) / 16)).toBeGreaterThanOrEqual(ARENA.x + 2);
    // As it rises no blow tells (the hero a cut's reach from it).
    const risen = fight({ at: 47 });
    const rb = boss(risen)!;
    expect(until(risen, () => moveOf(rb, MOVES)?.id === 'rise', 30)).toBe(true);
    for (let i = 0; i < 40; i++) step(risen, { action: i % 2 === 0, right: i < 2 });
    expect(rb.hp).toBe(rb.maxHp);
  });

  it('opens the doorways when it falls, and stays beaten: the next rest loads the region without it', () => {
    const sim = fight({ at: 40, altars: [70] });
    const log = announced(sim);
    expect(until(sim, () => log.includes('arena_shut'), 120)).toBe(true);
    lastBlow(boss(sim)!);
    expect(botUntil(sim, () => log.includes('arena_open'), 60 * 30)).toBe(true);
    expect([boss(sim), doors(sim)]).toEqual([undefined, ['air', 'air']]);
    expect(botUntil(sim, () => log.includes('rest'), 60 * 20)).toBe(true);
    step(sim, {}, 2);
    expect([log, boss(sim), doors(sim)]).toEqual([
      ['boss', 'arena_shut', 'arena_open', 'rest'],
      undefined,
      ['air', 'air'],
    ]);
  });

  it('sends a hero who falls in the arena back to the last rest, the doorways open and the boss whole, kneeling again', () => {
    const sim = fight({ altars: [8] });
    const log = announced(sim);
    expect(until(sim, () => centerX(hero(sim)) >= 8 * 16 + 4, 120, { right: true })).toBe(true);
    step(sim, { up: true });
    step(sim, {}, 2);
    expect(log).toEqual(['rest']);
    expect(until(sim, () => log.includes('arena_shut'), 60 * 20, { right: true })).toBe(true);
    hero(sim).hp = 1;
    expect(until(sim, () => !hero(sim).alive, 60 * 20)).toBe(true);
    expect(doors(sim)).toEqual(['air', 'air']);
    expect(until(sim, () => hero(sim).alive, 60 * 3)).toBe(true);
    step(sim, {}, 2);
    // Its room sleeps with the hero away: it has not woken since.
    const b = boss(sim)!;
    expect([b.hp, b.maxHp, b.dormant, (b.fsm?.entries ?? 0) <= 1, doors(sim)]).toEqual([
      36,
      36,
      true,
      true,
      ['air', 'air'],
    ]);
    expect(Math.abs(hero(sim).x - 8 * 16)).toBeLessThan(24);
    expect(log).toEqual(['rest', 'boss', 'arena_shut', 'arena_open']);
  });

  it('raises its cleaver for half a second before the chop falls: a hero who stands still is struck', () => {
    const sim = fight({ at: 44 });
    const b = boss(sim)!;
    expect(until(sim, () => moveOf(b, MOVES)?.id === 'chop', 60 * 5)).toBe(true);
    const started = sim.tick - moveTick(b);
    expect(until(sim, () => hero(sim).hp < 5, 60)).toBe(true);
    expect(sim.tick - started).toBeGreaterThanOrEqual(move('chop').startup);
    expect(hero(sim).hp).toBe(5 - move('chop').damage);
  });

  it('leaps at a hero who keeps away, airborne from the end of its crouch, its cleaver brought down on one who stands', () => {
    const sim = fight({ at: 38 });
    const b = boss(sim)!;
    expect(until(sim, () => moveOf(b, MOVES)?.id === 'leap', 60 * 5)).toBe(true);
    const from = b.x;
    expect(until(sim, () => moveTick(b) >= move('leap').startup, 40)).toBe(true);
    expect(b.grounded).toBe(true);
    step(sim, {}, 2);
    expect(b.grounded).toBe(false);
    expect(until(sim, () => b.grounded, 60)).toBe(true);
    expect(from - b.x).toBeGreaterThan(80);
    expect(hero(sim).hp).toBe(5 - move('leap').damage);
  });

  it('drags its cleaver along the floor: a wave of sparks runs out low at the hero, to be jumped', () => {
    // A headsman that only drags.
    const DRAGS: BehaviourFsm = {
      version: 1,
      id: 'headsman',
      designNotes: '',
      initial: 'drag',
      states: {
        drag: {
          onEnter: [
            { kind: 'move_toward_player', speed: 0 },
            { kind: 'play_anim', anim: 'drag' },
          ],
          update: [],
          transitions: [{ to: 'rest', when: { kind: 'timer_elapsed', ms: 1170 } }],
        },
        rest: { onEnter: [{ kind: 'play_anim', anim: 'walk' }], update: [], transitions: [] },
      },
    };
    const sim = fight({ at: 40, behaviours: [DRAGS] });
    const b = boss(sim)!;
    const wave = () => sim.world.entities.find((e) => e.type === 'wave');
    expect(until(sim, () => wave() !== undefined, 60)).toBe(true);
    const w = wave()!;
    // From its front, at the clock's tick, its lowest pixel just over the floor, running at the hero.
    expect(moveTick(b) - 1).toBe(move('drag').projectile!.at);
    expect([w.vx, w.y + w.h]).toEqual([-move('drag').projectile!.speed, b.y + b.h - 1]);
    expect(until(sim, () => hero(sim).hp < 5 || wave() === undefined, 60)).toBe(true);
    expect(hero(sim).hp).toBe(4);
    // Jumped, it passes under the hero.
    const jumped = fight({ at: 40, behaviours: [DRAGS] });
    const jw = () => jumped.world.entities.find((e) => e.type === 'wave');
    expect(until(jumped, () => jw() !== undefined, 60)).toBe(true);
    expect(until(jumped, () => Math.abs(jw()!.x - hero(jumped).x) < 60, 60)).toBe(true);
    step(jumped, { jump: true }, 12);
    expect(until(jumped, () => jw() === undefined, 60 * 5)).toBe(true);
    expect(hero(jumped).hp).toBe(5);
  });

  it('roars at half health, untouchable, and fights faster after: the two-blow combo in place of the chop', () => {
    const sim = fight({ at: 47 });
    const log = announced(sim);
    const b = boss(sim)!;
    expect(until(sim, () => b.fsm?.state === 'watch', 60 * 3)).toBe(true);
    b.hp = Math.floor(b.maxHp / 2) - 1;
    step(sim, {});
    expect([b.fsm?.state, b.flags['enraged'], log.includes('enrage')]).toEqual([
      'roar',
      true,
      true,
    ]);
    const hp = b.hp;
    for (let i = 0; i < 40; i++) step(sim, { action: i % 2 === 0 });
    expect(b.hp).toBe(hp);
    expect(until(sim, () => b.fsm?.state === 'fury', 60 * 3)).toBe(true);
    expect(until(sim, () => moveOf(b, MOVES)?.id === 'combo', 60 * 3)).toBe(true);
    // Once only: in its fury it does not roar again.
    expect(log.filter((e) => e === 'enrage')).toHaveLength(1);
  });

  it('is beaten under both feels by the route bot and by the human-like fighter: parried, riposted and cut in its openings', () => {
    for (const feelId of Object.keys(castle.feelPresets)) {
      for (const bot of ['route', 'human']) {
        const sim = fight({ feel: feelId });
        const r = runBot(sim, castle.bots[bot]!, 60 * 120);
        expect([feelId, bot, r.completed, r.deaths, boss(sim)]).toEqual([feelId, bot, true, 0, undefined]);
      }
    }
  });

  it('is beyond a person when its blows come quicker than they can see: a 12-tick chop the route bot still parries', () => {
    // The chop and the combo wound up in 12 ticks, a fifth of a second: as long as the human-like fighter takes to see one.
    const quick = MoveSet.parse({ ...DEFAULT_MOVES, moves: DEFAULT_MOVES.moves.map((m) => (m.id === 'chop' || m.id === 'combo' ? { ...m, startup: 12 } : m)) });
    const parries = (sim: Sim) => {
      let n = 0;
      sim.events.on('custom:parry', () => n++);
      return () => n;
    };
    const exact = fight({ moves: quick });
    const exactParries = parries(exact);
    expect(runBot(exact, castle.bots['route']!, 60 * 120).completed).toBe(true);
    expect(exactParries()).toBeGreaterThan(0);
    const person = fight({ moves: quick });
    const personParries = parries(person);
    const r = runBot(person, castle.bots['human']!, 60 * 60);
    expect([r.completed, personParries(), r.deaths > 0]).toEqual([false, 0, true]);
  });

  it('outlasts a player who stands still, and one who mashes the keys', () => {
    const idle = fight({ at: 40 });
    for (let i = 0; i < 60 * 40; i++) step(idle, {});
    expect([idle.world.deaths > 0, boss(idle)?.hp]).toEqual([true, 36]);
    const masher = fight();
    const r = runBot(masher, castle.bots['chaos']!, 60 * 60);
    expect([r.completed, boss(masher)?.alive]).toEqual([false, true]);
  });
});

describe('the boss in the region', () => {
  const warnings = (level: LevelJson) =>
    castle.levelGrammar
      .validate(level, castle.feelPresets[castle.defaultFeel]!)
      .issues.map((i) => i.code)
      .filter((c) => ['boss_bypassed', 'boss_outside_arena', 'arena_without_boss'].includes(c));

  it('waits in a room of its own before the way out, from 0.2: the way out lies behind it', () => {
    for (const difficulty of [0.1, 0.3, 0.6, 0.9]) {
      for (const seed of [1, 2]) {
        const level = castle.levelGrammar.generate({ seed, difficulty });
        const arenas = (level.rooms ?? []).filter((r) => r.kind === 'boss');
        expect(arenas).toHaveLength(difficulty >= 0.2 ? 1 : 0);
        const report = castle.levelGrammar.validate(level, castle.feelPresets[castle.defaultFeel]!);
        expect([report.metrics['bosses'], warnings(level)]).toEqual([arenas.length, []]);
      }
    }
  });

  it('warns of a boss the way out does not need, one outside a boss room, and a boss room with none', () => {
    const level = bossLevel();
    expect(warnings(level)).toEqual([]);
    const rows = level.rows.map((r, y) =>
      y === 14 ? `${r.slice(0, 20)}G${r.slice(21, 85)}.${r.slice(86)}` : r,
    );
    expect(warnings({ ...level, rows, goal: { x: 20, y: 14 } })).toEqual(['boss_bypassed']);
    expect(
      warnings({ ...level, entities: [{ type: HEADSMAN_TYPE, x: 20, y: 14, props: {} }] }),
    ).toEqual(['boss_outside_arena', 'arena_without_boss']);
  });
});
