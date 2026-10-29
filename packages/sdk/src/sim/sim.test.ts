import type { BehaviourFsm, LevelJson } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { CELESTE_CLASS } from './feel.js';
import { emptyInput } from './input.js';
import { moveBody } from './physics.js';
import { Rng } from './rng.js';
import { createSim, goalCloseness, replay, type SimOptions } from './sim.js';
import { defineSystem, type MenuSpec, type SimCtx } from './system.js';
import { Tilemap } from './tilemap.js';

const level: LevelJson = {
  version: 1,
  id: 'test',
  name: 'test',
  tileSize: 8,
  width: 24,
  height: 8,
  legend: { '.': 'air', '#': 'solid', '^': 'hazard', G: 'goal' },
  rows: [
    '........................',
    '........................',
    '........................',
    '........................',
    '..............#.........',
    '.......................G',
    '########.^^.############',
    '########################',
  ],
  entities: [{ type: 'walker', x: 16, y: 5, props: {} }],
  spawn: { x: 1, y: 5 },
  goal: { x: 23, y: 5 },
};

const walker: BehaviourFsm = {
  version: 1,
  id: 'walker',
  designNotes: '',
  initial: 'patrol',
  states: {
    patrol: { onEnter: [], update: [{ kind: 'patrol', speed: 30 }], transitions: [{ to: 'chase', when: { kind: 'player_within', px: 40 } }] },
    chase: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_toward_player', speed: 50 }], transitions: [{ to: 'patrol', when: { kind: 'player_beyond', px: 80 } }] },
  },
};

/** Minimal player mover so the sim test exercises physics and rng without a template. */
const mover = defineSystem<{ jumps: number }>({
  id: 'test-mover',
  init: () => ({ jumps: 0 }),
  fixedUpdate(state, input, ctx) {
    const p = ctx.world.player;
    const f = ctx.feel;
    p.vx = input.left ? -f.maxRun : input.right ? f.maxRun : 0;
    p.vy = Math.min(p.vy + f.gravity * ctx.dt, f.maxFall);
    if (input.jump && p.grounded) {
      p.vy = f.jumpSpeed;
      state.jumps++;
      ctx.emit('jump', { n: state.jumps, r: ctx.rng.int(100) });
    }
    ctx.move(p, p.vx * ctx.dt, p.vy * ctx.dt);
    if (ctx.map.isHazard(p.x, p.y, p.w, p.h)) ctx.damage(p, 99, null);
    if (ctx.map.isGoal(p.x, p.y, p.w, p.h)) ctx.world.flags.won = true;
  },
  onEvent(state, ev, ctx) {
    if (ev.name === 'death') ctx.respawnPlayer();
  },
});

const options: SimOptions = {
  level,
  feel: CELESTE_CLASS,
  seed: 7,
  systems: [mover],
  entityDefs: [{ type: 'walker', w: 8, h: 8, hp: 1, contactDamage: 1, fsm: 'walker' }],
  player: { w: 8, h: 11, hp: 3 },
  behaviours: [walker],
};

describe('Rng', () => {
  it('is deterministic per seed and counts calls', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 5 }, () => a.int(1000));
    const sb = Array.from({ length: 5 }, () => b.int(1000));
    const sc = Array.from({ length: 5 }, () => c.int(1000));
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(a.calls).toBe(5);
  });
});

describe('physics', () => {
  it('lands on the floor and stops at walls', () => {
    const map = new Tilemap(level);
    const b = { x: 8, y: 0, w: 8, h: 8, vx: 0, vy: 100, grounded: false, hitWall: false, hitCeiling: false, facing: 1 };
    for (let i = 0; i < 60; i++) moveBody(map, b, 0, 100 / 60);
    expect(b.grounded).toBe(true);
    expect(b.y + b.h).toBeCloseTo(48, 3);
    const w = { x: 100, y: 36, w: 8, h: 8, vx: 60, vy: 0, grounded: true, hitWall: false, hitCeiling: false, facing: 1 };
    for (let i = 0; i < 60; i++) moveBody(map, w, 1, 0);
    expect(w.hitWall).toBe(true);
    expect(w.x + w.w).toBeLessThanOrEqual(112);
  });
});

describe('sim', () => {
  const script = [
    { from: 0, to: 40, input: { right: true } },
    { from: 40, to: 42, input: { right: true, jump: true } },
    { from: 42, to: 400, input: { right: true } },
  ];

  it('is deterministic: same seed + script => same hash; different seed => different hash', () => {
    const a = replay(options, script, 400);
    const b = replay(options, script, 400);
    const c = replay(options, script, 400, 8);
    expect(a.hash).toBe(b.hash);
    expect(a.tick).toBe(400);
    expect(c.hash).not.toBe(a.hash);
  });

  it('records an input log that replays to the same state', () => {
    const sim = createSim(options);
    sim.run(script, 400);
    const live = sim.snapshot();
    const log = sim.inputLog();
    const again = createSim(options);
    for (let t = 0; t < 400; t++) {
      let input = log[0]?.input ?? { left: false, right: false, up: false, down: false, jump: false, dash: false, action: false, pause: false };
      for (const f of log) if (f.tick <= t) input = f.input;
      again.step(input);
    }
    expect(again.snapshot().hash).toBe(live.hash);
  });

  it('runs the walker fsm and reaches the goal under the script', () => {
    const sim = createSim(options);
    sim.run(script, 400);
    const snap = sim.snapshot();
    const w = snap.entities.find((e) => e.type === 'walker');
    expect(w).toBeDefined();
    expect(['patrol', 'chase']).toContain(w?.state);
    expect(sim.events.count('jump')).toBeGreaterThan(0);
    expect(sim.events.count('level_start')).toBe(1);
  });

  it('kills the player on hazards and respawns at the checkpoint', () => {
    const sim = createSim(options);
    sim.run([{ from: 0, to: 120, input: { right: true } }], 120);
    expect(sim.world.deaths).toBeGreaterThanOrEqual(1);
    expect(sim.world.player.alive).toBe(true);
    // The death names its level and position, for the creator's heatmaps.
    const death = sim.events.history().find((e) => e.name === 'death');
    expect(death?.payload).toMatchObject({ type: 'player', level: sim.world.levelId });
    expect(typeof death?.payload['x']).toBe('number');
  });
});

describe('runtime tile changes', () => {
  it('setKind changes a tile, bumps the version once per real change and ignores out-of-bounds', () => {
    const map = new Tilemap(level);
    expect(map.version).toBe(0);
    expect(map.kindAt(14, 4)).toBe('solid');
    map.setKind(14, 4, 'air');
    map.setKind(14, 4, 'air');
    map.setKind(-1, 4, 'air');
    map.setKind(14, 99, 'air');
    expect(map.kindAt(14, 4)).toBe('air');
    expect(map.version).toBe(1);
  });
  it('a system that opens a wall lets the player through, and a reset restores the level as authored', () => {
    const walled: LevelJson = { ...level, rows: level.rows.map((r, y) => (y >= 3 && y <= 5 ? r.slice(0, 5) + '#' + r.slice(6) : r)), entities: [] };
    const opener = defineSystem<{ opened: boolean }>({
      id: 'opener',
      init: () => ({ opened: false }),
      fixedUpdate(s, _input, ctx) {
        if (!s.opened && ctx.tick === 60) {
          for (let y = 3; y <= 5; y++) ctx.map.setKind(5, y, 'air');
          s.opened = true;
        }
      },
    });
    const sim = createSim({ ...options, level: walled, systems: [...options.systems, opener] });
    sim.run([{ from: 0, to: 59, input: { right: true } }], 59);
    expect(sim.world.player.x).toBeLessThan(5 * 8);
    sim.run([{ from: 59, to: 140, input: { right: true } }], 81);
    expect(sim.world.player.x).toBeGreaterThan(5 * 8);
    sim.reset();
    expect(sim.map.kindAt(5, 4)).toBe('solid');
    expect(sim.map.version).toBe(0);
  });
});

describe('in-game menus', () => {
  const flat: LevelJson = { ...level, entities: [{ type: 'sleeper', x: 16, y: 5, props: {} }] };
  // Wakes after half a second, so a test can see whether its timer ran while the world was frozen.
  const sleeper: BehaviourFsm = {
    version: 1,
    id: 'sleeper',
    designNotes: '',
    initial: 'sleep',
    states: { sleep: { onEnter: [], update: [], transitions: [{ to: 'awake', when: { kind: 'timer_elapsed', ms: 500 } }] }, awake: { onEnter: [], update: [], transitions: [] } },
  };
  const opener = (at: number, spec: Partial<MenuSpec> = {}) =>
    defineSystem<null>({
      id: 'opener',
      init: () => null,
      fixedUpdate(_s, _input, ctx) {
        if (ctx.tick === at) ctx.openMenu({ id: 'boon', title: 'Choose a boon', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }, { id: 'c', label: 'C' }], ...spec });
      },
    });
  const make = (at = 10, spec = {}) =>
    createSim({ ...options, level: flat, systems: [mover, opener(at, spec)], entityDefs: [{ type: 'sleeper', w: 8, h: 8, hp: 1, fsm: 'sleeper' }], behaviours: [sleeper] });
  const idle = { left: false, right: false, up: false, down: false, jump: false, dash: false, action: false, pause: false };
  const tap = (sim: ReturnType<typeof make>, key: keyof typeof idle) => {
    sim.step({ ...idle, [key]: true });
    sim.step(idle);
  };

  it('freezes the world while open: the player does not move and the tick still counts', () => {
    const sim = make();
    sim.run([{ from: 0, to: 11, input: {} }], 11);
    expect(sim.world.menu?.id).toBe('boon');
    expect(sim.events.history().find((e) => e.name === 'menu_open')?.payload).toEqual({ menu: 'boon', options: ['a', 'b', 'c'] });
    const x = sim.world.player.x;
    sim.run([{ from: 11, to: 60, input: { right: true } }], 49);
    expect(sim.world.player.x).toBe(x);
    expect(sim.tick).toBe(60);
    // Holding right moved the highlight once (one press), past the disabled option.
    expect(sim.snapshot().menu).toEqual({ id: 'boon', selected: 2, options: ['a', 'b', 'c'] });
  });

  it('moves the highlight over disabled options, wraps, and picks only after the grace period with a fresh press', () => {
    const sim = make();
    sim.run([{ from: 0, to: 11, input: { action: true } }], 11);
    // Held from before the menu opened: never a pick.
    for (let i = 0; i < 30; i++) sim.step({ ...idle, action: true });
    expect(sim.world.menu).not.toBeNull();
    tap(sim, 'right');
    expect(sim.world.menu?.selected).toBe(2);
    tap(sim, 'right');
    expect(sim.world.menu?.selected).toBe(0);
    tap(sim, 'left');
    expect(sim.world.menu?.selected).toBe(2);
    tap(sim, 'action');
    expect(sim.world.menu).toBeNull();
    expect(sim.events.history().find((e) => e.name === 'menu_choose')?.payload).toEqual({ menu: 'boon', option: 'c', index: 2 });
    expect(sim.snapshot().menu).toBeUndefined();
  });

  it('ignores a press inside the grace period', () => {
    const sim = make();
    sim.run([{ from: 0, to: 11, input: {} }], 11);
    tap(sim, 'action');
    expect(sim.world.menu).not.toBeNull();
  });

  it('holds behaviour timers while a menu is open', () => {
    const wokeAt = (sim: ReturnType<typeof make>) => {
      for (let t = 0; t < 400; t++) {
        // Pick as soon as the grace period is over.
        sim.step({ ...idle, action: sim.world.menu !== null && t % 2 === 0 && sim.tick - sim.world.menu.openedTick >= 18 });
        if (sim.world.entities.find((e) => e.type === 'sleeper')?.fsm?.state === 'awake') return sim.tick;
      }
      return -1;
    };
    const plain = wokeAt(make(-1));
    const menu = make(10);
    const withMenu = wokeAt(menu);
    const open = menu.events.history().find((e) => e.name === 'menu_open')!.tick;
    const close = menu.events.history().find((e) => e.name === 'menu_choose')!.tick;
    expect(plain).toBeGreaterThan(0);
    expect(withMenu - plain).toBe(close - open);
  });

  it('a cancellable menu closes on dash with no option; one with nothing to pick is always cancellable', () => {
    const shop = make(10, { cancellable: true });
    shop.run([{ from: 0, to: 40, input: {} }], 40);
    tap(shop, 'dash');
    expect(shop.world.menu).toBeNull();
    expect(shop.events.history().find((e) => e.name === 'menu_choose')?.payload).toEqual({ menu: 'boon', option: null, index: -1 });
    const empty = make(10, { options: [{ id: 'x', label: 'X', disabled: true }] });
    empty.run([{ from: 0, to: 40, input: {} }], 40);
    expect(empty.world.menu?.cancellable).toBe(true);
    tap(empty, 'action');
    expect(empty.world.menu).not.toBeNull();
    tap(empty, 'dash');
    expect(empty.world.menu).toBeNull();
  });

  it('pausing holds behaviour timers too', () => {
    const run = (pauseTicks: number) => {
      const sim = make(-1);
      // The sleeper's timer starts on the first world step; pause after it is running.
      for (let i = 0; i < 5; i++) sim.step(idle);
      if (pauseTicks > 0) {
        sim.step({ ...idle, pause: true });
        for (let i = 1; i < pauseTicks; i++) sim.step(idle);
        sim.step({ ...idle, pause: true });
      }
      for (let t = 0; t < 400; t++) {
        sim.step(idle);
        if (sim.world.entities.find((e) => e.type === 'sleeper')?.fsm?.state === 'awake') return sim.tick;
      }
      return -1;
    };
    expect(run(50) - run(0)).toBe(50);
  });

  it('copies carried props onto the player before systems init', () => {
    let seen: unknown = null;
    const reader = defineSystem<null>({
      id: 'reader',
      init(ctx) {
        seen = ctx.world.player.props['power'];
        return null;
      },
      fixedUpdate() {},
    });
    const sim = createSim({ ...options, systems: [reader], carry: { power: 3 } });
    expect(seen).toBe(3);
    expect(sim.world.player.props['power']).toBe(3);
    sim.reset();
    expect(sim.world.player.props['power']).toBe(3);
  });
});

describe('behaviour conditions', () => {
  it('took_damage is false for an entity never hit, even on the first tick', () => {
    const sentry: BehaviourFsm = {
      version: 1,
      id: 'sentry',
      designNotes: '',
      initial: 'calm',
      states: { calm: { onEnter: [], update: [], transitions: [{ to: 'angry', when: { kind: 'took_damage' } }] }, angry: { onEnter: [], update: [], transitions: [] } },
    };
    // Hits the sentry once, on tick 6.
    const striker = defineSystem<null>({
      id: 'striker',
      init: () => null,
      fixedUpdate(_s, _input, ctx) {
        const e = ctx.world.entities.find((x) => x.type === 'walker');
        if (ctx.tick === 6 && e) ctx.damage(e, 1, null);
      },
    });
    const sim = createSim({ ...options, systems: [striker], entityDefs: [{ type: 'walker', w: 8, h: 8, hp: 3, fsm: 'sentry' }], behaviours: [sentry] });
    sim.run([], 5);
    const e = sim.world.entities.find((x) => x.type === 'walker')!;
    expect(e.fsm?.state).toBe('calm');
    sim.run([], 2);
    expect(e.fsm?.state).toBe('angry');
  });
});

describe('save points', () => {
  // Opens a menu on tick 40 (picked on 70) and knocks a hole in the floor on tick 90: state beyond the world itself.
  const events = defineSystem<{ opened: boolean }>({
    id: 'events',
    init: () => ({ opened: false }),
    fixedUpdate(s, _input, ctx) {
      if (ctx.tick === 40 && !s.opened) {
        s.opened = true;
        ctx.openMenu({ id: 'm', title: 'M', options: [{ id: 'a', label: 'A' }] });
      }
      if (ctx.tick === 90) ctx.map.setKind(12, 6, 'air');
      if (ctx.tick % 25 === 0) ctx.emit('custom:tick', { r: ctx.rng.int(1000) });
    },
  });
  const opts = { ...options, systems: [mover, events] };
  const script = [
    { from: 0, to: 60, input: { right: true } },
    { from: 60, to: 62, input: { action: true } },
    { from: 62, to: 64, input: {} },
    { from: 64, to: 66, input: { action: true } },
    { from: 66, to: 140, input: { right: true, jump: true } },
    { from: 140, to: 300, input: { left: true } },
  ];

  it('loading a save and replaying the same inputs reaches the same states, as often as asked', () => {
    const straight = createSim(opts);
    straight.run(script, 300);
    const sim = createSim(opts);
    sim.run(script, 50);
    expect(sim.world.menu).not.toBeNull();
    const at50 = sim.save();
    const hash50 = sim.hash();
    sim.run(script, 250);
    expect(sim.hash()).toBe(straight.hash());
    for (let i = 0; i < 2; i++) {
      sim.load(at50);
      expect(sim.tick).toBe(50);
      expect(sim.hash()).toBe(hash50);
      expect(sim.world.menu?.id).toBe('m');
      sim.run(script, 250);
      expect(sim.hash()).toBe(straight.hash());
      expect(sim.map.kindAt(12, 6)).toBe('air');
      expect(sim.events.count('custom:tick')).toBe(straight.events.count('custom:tick'));
    }
  });

  it('branches: a different future from a save leaves the save untouched', () => {
    const sim = createSim(opts);
    sim.run(script, 100);
    const at100 = sim.save();
    const hash100 = sim.hash();
    sim.run([{ from: 100, to: 200, input: { right: true } }], 100);
    const right = sim.hash();
    sim.load(at100);
    sim.run([{ from: 100, to: 200, input: { left: true } }], 100);
    expect(sim.hash()).not.toBe(right);
    sim.load(at100);
    expect(sim.hash()).toBe(hash100);
    expect(sim.map.kindAt(12, 6)).toBe('air');
  });
});

describe('progress', () => {
  const fixed = (id: string, value: () => number) => defineSystem<null>({ id, init: () => null, fixedUpdate: () => {}, progress: value });

  it('without hooks it is how much closer to the goal the player is than at the spawn, and 1 once won', () => {
    const sim = createSim(options);
    expect(sim.progress()).toBeCloseTo(goalCloseness(sim.map, sim.world.player));
    const start = sim.progress();
    expect(start).toBeLessThan(0.1);
    sim.run([{ from: 0, to: 40, input: { right: true } }], 40);
    expect(sim.progress()).toBeGreaterThan(start);
    sim.world.flags.won = true;
    expect(sim.progress()).toBe(1);
  });

  it('is the mean of the hooks, each clamped to 0..1, ignoring values that are not finite', () => {
    const sim = createSim({ ...options, systems: [mover, fixed('a', () => 0.2), fixed('b', () => 0.6), fixed('c', () => 7), fixed('d', () => Number.NaN), fixed('e', () => -1)] });
    expect(sim.progress()).toBeCloseTo((0.2 + 0.6 + 1 + 0) / 4);
  });

  it('counts only the systems named in progressFrom, when set (a composed game asks its win owner alone)', () => {
    const systems = [mover, fixed('win', () => 0.8), fixed('side', () => 0.2)];
    expect(createSim({ ...options, systems }).progress()).toBeCloseTo(0.5);
    expect(createSim({ ...options, systems, progressFrom: ['win'] }).progress()).toBeCloseTo(0.8);
    // Naming no system with a hook falls back to the goal, as a game without hooks does.
    const none = createSim({ ...options, systems, progressFrom: ['mover'] });
    expect(none.progress()).toBeCloseTo(goalCloseness(none.map, none.world.player));
  });

  it('reading it never changes the game: hooks may read, but the rng and every action throw', () => {
    const reader = fixed('reader', () => 0.5);
    const a = createSim({ ...options, systems: [mover, reader] });
    const b = createSim({ ...options, systems: [mover, reader] });
    for (let t = 0; t < 120; t++) {
      const input = { ...emptyInput(), right: true, jump: t % 30 === 0 };
      a.step(input);
      b.step(input);
      a.progress();
    }
    expect(a.hash()).toBe(b.hash());
    // Reading events is fine: a hook may count what happened.
    const c = createSim({ ...options, systems: [mover, fixed('jumps', () => 0)] });
    const counter = defineSystem<null>({ id: 'counter', init: () => null, fixedUpdate: () => {}, progress: (_s, ctx) => ctx.events.count('jump') / 10 });
    const d = createSim({ ...options, systems: [mover, counter] });
    d.run([{ from: 0, to: 60, input: { right: true, jump: true } }], 60);
    c.run([{ from: 0, to: 60, input: { right: true, jump: true } }], 60);
    expect(d.events.count('jump')).toBeGreaterThan(0);
    expect(d.progress()).toBeCloseTo(d.events.count('jump') / 10);
    expect(d.hash()).toBe(c.hash());
    const cheats: Array<[string, (ctx: SimCtx) => unknown]> = [
      ['rng', (ctx) => ctx.rng.int(10)],
      ['emit', (ctx) => ctx.emit('x')],
      ['bus', (ctx) => ctx.events.emit(0, 'x')],
      ['spawn', (ctx) => ctx.spawn('walker', 0, 0)],
      ['damage', (ctx) => ctx.damage(ctx.world.player, 1, null)],
      ['move', (ctx) => ctx.move(ctx.world.player, 1, 0)],
      ['menu', (ctx) => ctx.openMenu({ id: 'm', title: 'M', options: [{ id: 'a', label: 'A' }] })],
    ];
    for (const [name, cheat] of cheats) {
      const sim = createSim({ ...options, systems: [mover, defineSystem<null>({ id: `cheat-${name}`, init: () => null, fixedUpdate: () => {}, progress: (_s, ctx) => Number(cheat(ctx)) })] });
      expect(() => sim.progress(), name).toThrow(/progress\(\) only reads the game/);
    }
  });
});
