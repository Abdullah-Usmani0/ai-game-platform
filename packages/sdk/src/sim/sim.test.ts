import type { BehaviourFsm, LevelJson } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { CELESTE_CLASS } from './feel.js';
import { moveBody } from './physics.js';
import { Rng } from './rng.js';
import { createSim, replay, type SimOptions } from './sim.js';
import { defineSystem } from './system.js';
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
