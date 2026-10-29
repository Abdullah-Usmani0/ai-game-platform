import type { LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, defineSystem, goalCloseness, type SimOptions } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { explore, explorerKeys, explorerOptionsFor, type ExploreOptions } from './explore.js';

/** A level from rows: '#' solid, '^' hazard, 'S' the spawn, 'G' the goal (the spawn when there is none), 'c' a crate. */
function level(rows: string[]): LevelJson {
  if (rows.some((r) => r.length !== rows[0]!.length)) throw new Error('ragged rows');
  const find = (ch: string) => {
    const y = rows.findIndex((r) => r.includes(ch));
    return y < 0 ? null : { x: rows[y]!.indexOf(ch), y };
  };
  const entities = rows.flatMap((r, y) => [...r].flatMap((ch, x) => (ch === 'c' ? [{ type: 'crate', x, y, props: {} }] : [])));
  const spawn = find('S')!;
  return {
    version: 1,
    id: 'test',
    name: 'Test',
    tileSize: 8,
    width: rows[0]!.length,
    height: rows.length,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', S: 'spawn', G: 'goal', c: 'air' },
    rows,
    entities,
    spawn,
    goal: find('G') ?? spawn,
  };
}

/** Run and jump; the pit kills, and the player starts over at the spawn. */
const runner = defineSystem<null>({
  id: 'runner',
  init: () => null,
  fixedUpdate(_s, input, ctx) {
    const p = ctx.world.player;
    const f = ctx.feel;
    if (!p.alive) return;
    p.vx = input.left ? -f.maxRun : input.right ? f.maxRun : 0;
    p.vy = Math.min(p.vy + f.gravity * ctx.dt, f.maxFall);
    if (input.jump && p.grounded) p.vy = f.jumpSpeed;
    ctx.move(p, p.vx * ctx.dt, p.vy * ctx.dt);
    if (ctx.map.isHazard(p.x, p.y, p.w, p.h)) ctx.damage(p, 99, null);
  },
  onEvent(_s, ev, ctx) {
    if (ev.name === 'death') ctx.respawnPlayer();
  },
});

/** Walk in eight directions. */
const walker = defineSystem<null>({
  id: 'walker',
  init: () => null,
  fixedUpdate(_s, input, ctx) {
    const v = 60 * ctx.dt;
    ctx.move(ctx.world.player, (Number(input.right) - Number(input.left)) * v, (Number(input.down) - Number(input.up)) * v);
  },
});

/** Touch the goal tile to win. */
const finish = defineSystem<{ done: boolean }>({
  id: 'finish',
  init: () => ({ done: false }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (!s.done && ctx.map.isGoal(p.x, p.y, p.w, p.h)) {
      s.done = true;
      ctx.world.flags.won = true;
    }
  },
  progress: (s, ctx) => (s.done ? 1 : goalCloseness(ctx.map, ctx.world.player)),
});

/** Every half second a rock lands on three columns the game's own rng picks; under it the run is over. Five seconds win. */
const rocks = defineSystem<{ band: number }>({
  id: 'rocks',
  init: (ctx) => ({ band: 1 + ctx.rng.int(ctx.map.width - 2) }),
  fixedUpdate(s, _input, ctx) {
    const w = ctx.world;
    w.hud['time'] = Math.floor(ctx.tick / 60);
    if (ctx.tick % 30 === 29) {
      if (Math.abs(Math.floor((w.player.x + w.player.w / 2) / ctx.map.tileSize) - s.band) <= 1) w.flags.gameOver = true;
      s.band = 1 + ctx.rng.int(ctx.map.width - 2);
    }
    if (ctx.tick >= 300 && !w.flags.gameOver) w.flags.won = true;
  },
  progress: (_s, ctx) => ctx.tick / 300,
});

/**
 * A grid board behind a menu: the game opens with Leave (highlighted, ends the run) or Begin. Each fresh arrow press
 * then steps one tile, pushing a crate when the tile beyond it is free; the crate on the goal tile wins. No progress
 * hook, so the explorer steers by the player's closeness to the goal.
 */
const pusher = defineSystem<{ prev: boolean }>({
  id: 'pusher',
  init: () => ({ prev: false }),
  fixedUpdate(s, input, ctx) {
    const w = ctx.world;
    const ts = ctx.map.tileSize;
    if (ctx.tick === 0) ctx.openMenu({ id: 'start', title: 'Ready?', options: [{ id: 'leave', label: 'Leave' }, { id: 'begin', label: 'Begin' }] });
    const press = input.left || input.right || input.up || input.down;
    if (press && !s.prev) {
      const dx = input.right ? ts : input.left ? -ts : 0;
      const dy = dx !== 0 ? 0 : input.down ? ts : -ts;
      const crateAt = (x: number, y: number) => w.entities.find((e) => e.type === 'crate' && e.x === x && e.y === y);
      const free = (x: number, y: number) => !ctx.map.isSolid(x, y, ts, ts) && !crateAt(x, y);
      const p = w.player;
      const crate = crateAt(p.x + dx, p.y + dy);
      if (crate ? free(crate.x + dx, crate.y + dy) : free(p.x + dx, p.y + dy)) {
        if (crate) ctx.move(crate, dx, dy);
        p.x += dx;
        p.y += dy;
      }
    }
    s.prev = press;
    if (w.entities.some((e) => e.type === 'crate' && ctx.map.isGoal(e.x, e.y, ts, ts))) w.flags.won = true;
  },
  onEvent(_s, ev, ctx) {
    if (ev.name === 'menu_choose' && ev.payload['option'] === 'leave') ctx.world.flags.gameOver = true;
  },
});

const PIT = level([
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '.S...........................G',
  '###########^^^################',
  '##############################',
]);

/** The straight line to the goal runs into a wall; the way round is through the gap at the bottom. */
const ROOM = level([
  '####################',
  '#S.......#.........#',
  '#........#.........#',
  '#........#.........#',
  '#........#....G....#',
  '#........#.........#',
  '#........#.........#',
  '#..................#',
  '#..................#',
  '####################',
]);

const ARENA = level(['##########', '#........#', '#........#', '#...S....#', '#........#', '#........#', '#........#', '##########']);

const BOARD = level(['#######', '#.....#', '#S.c.G#', '#.....#', '#######', '#######']);

const base = (lvl: LevelJson, systems: SimOptions['systems'], extra: Partial<SimOptions> = {}) => (): ReturnType<typeof createSim> =>
  createSim({ level: lvl, feel: CELESTE_CLASS, seed: 1, systems, entityDefs: [], player: { w: 8, h: 8, hp: 1 }, ...extra });

const platformer = base(PIT, [runner, finish], { player: { w: 8, h: 11, hp: 1 } });
const room = base(ROOM, [walker, finish], { movementMode: 'topdown' });
const survival = base(ARENA, [walker, rocks], { movementMode: 'topdown' });
const board = base(BOARD, [pusher], { movementMode: 'topdown', entityDefs: [{ type: 'crate', w: 8, h: 8, gravity: false }] });

/** The proof holds: the script wins again on a fresh sim, in the reported number of ticks. */
function provenOn(make: () => ReturnType<typeof createSim>, opts: ExploreOptions) {
  const r = explore(make, opts);
  expect(r.completed, JSON.stringify(r.best)).toBe(true);
  const again = make();
  again.run(r.script!, r.ticks);
  expect(again.world.flags.won).toBe(true);
  expect(r.explored).toBeLessThanOrEqual(opts.budget!);
  return r;
}

describe('explore', () => {
  it('jumps a pit of spikes', () => {
    provenOn(platformer, { budget: 20_000 });
  });

  it('finds the way round a wall in a top-down room', () => {
    provenOn(room, { budget: 20_000 });
  });

  it('survives five seconds of falling rocks, the runs that die going nowhere', () => {
    const r = provenOn(survival, { budget: 20_000 });
    expect(r.ticks).toBe(301);
  });

  it('answers a menu and pushes a crate one tap at a time', () => {
    const r = provenOn(board, { budget: 20_000, ...explorerOptionsFor([{ controls: { left: 'step', right: 'step', up: 'step', down: 'step' } }]) });
    // Taps: no arrow is ever held for more than two ticks.
    for (const seg of r.script!) if (seg.input.left || seg.input.right || seg.input.up || seg.input.down) expect(seg.to - seg.from).toBeLessThanOrEqual(2);
  });

  it('is deterministic: the same options find the same run', () => {
    expect(explore(room, { budget: 20_000, seed: 3 })).toEqual(explore(room, { budget: 20_000, seed: 3 }));
  });

  it('reports its most progressed moment when the budget runs out', () => {
    const r = explore(room, { budget: 120 });
    expect(r).toMatchObject({ completed: false, script: null, ticks: -1, explored: 120 });
    expect(r.best.progress).toBeGreaterThan(0);
    expect(r.best.progress).toBeLessThan(1);
    expect(r.best.goalDistance).toBeGreaterThan(0);
  });

  it('presses only the keys it is given: without jump the pit cannot be crossed', () => {
    expect(explore(platformer, { budget: 8_000, keys: ['left', 'right'] }).completed).toBe(false);
  });

  it('keeps the archive under its cap', () => {
    expect(explore(room, { budget: 6_000, maxCells: 30 }).cells).toBeLessThanOrEqual(30);
  });
});

describe('explorer options from system metadata', () => {
  it('leaves out the keys systems use to undo or restart, and taps for grid steppers', () => {
    const grid = [{ controls: { action: 'attack' } }, { controls: { left: 'step', up: 'step', action: 'undo', dash: 'restart' } }];
    expect(explorerKeys(grid)).toEqual(['left', 'right', 'up', 'down', 'jump']);
    expect(explorerOptionsFor(grid)).toEqual({ keys: ['left', 'right', 'up', 'down', 'jump'], taps: true });
    expect(explorerOptionsFor([{}, { controls: { action: 'attack' } }])).toEqual({ keys: ['left', 'right', 'up', 'down', 'jump', 'dash', 'action'], taps: false });
  });
});
