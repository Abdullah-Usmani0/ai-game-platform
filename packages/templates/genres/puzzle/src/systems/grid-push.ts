import { defineSystem, type Entity, type InputState, type SimCtx } from '@gg/sdk';
import { CRATE_TYPE, DIR_VEC, TARGET_TYPE, type Dir } from '../puzzle.js';

interface Tile {
  x: number;
  y: number;
}
interface Crate extends Tile {
  id: number;
}
/** A step in progress: what moved and how far along the slide is. crate is an entity id, or -1. */
interface Motion {
  t: number;
  dx: number;
  dy: number;
  crate: number;
}
interface GridPushState {
  player: Tile;
  crates: Crate[];
  targets: Tile[];
  start: { player: Tile; crates: Crate[] };
  motion: Motion | null;
  queued: Dir | null;
  held: Dir | null;
  heldTicks: number;
  /** Buttons down last tick, as a bit mask (see BIT). */
  prev: number;
  history: Array<{ dx: number; dy: number; crate: number }>;
  moves: number;
  pushes: number;
  done: boolean;
}

const BIT = { up: 1, down: 2, left: 4, right: 8, action: 16, dash: 32 } as const;
const DIR_BITS: ReadonlyArray<[number, Dir]> = [
  [BIT.up, 'up'],
  [BIT.down, 'down'],
  [BIT.left, 'left'],
  [BIT.right, 'right'],
];
const FLOOR = new Set(['air', 'spawn', 'goal']);
/** Undo depth kept per level. */
const MAX_HISTORY = 1000;

function bitsOf(input: InputState): number {
  return (input.up ? BIT.up : 0) | (input.down ? BIT.down : 0) | (input.left ? BIT.left : 0) | (input.right ? BIT.right : 0) | (input.action ? BIT.action : 0) | (input.dash ? BIT.dash : 0);
}

function intParam(ctx: SimCtx, key: string, min: number, max: number, fallback: number): number {
  const v = ctx.params[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
}

function tileOf(e: Entity, ts: number): Tile {
  return { x: Math.floor((e.x + e.w / 2) / ts), y: Math.floor((e.y + e.h / 2) / ts) };
}

/** Out of the map or not floor (the tilemap reports open sky above row 0; a board has no sky). */
function blocked(ctx: SimCtx, t: Tile): boolean {
  if (t.x < 0 || t.y < 0 || t.x >= ctx.map.width || t.y >= ctx.map.height) return true;
  return !FLOOR.has(ctx.map.kindAt(t.x, t.y));
}

/** Centre an entity on a tile, `back` tiles behind it along (dx, dy) while it slides there. */
function place(e: Entity, t: Tile, ts: number, back = 0, dx = 0, dy = 0): void {
  e.x = (t.x - back * dx) * ts + (ts - e.w) / 2;
  e.y = (t.y - back * dy) * ts + (ts - e.h) / 2;
}

const entity = (ctx: SimCtx, id: number): Entity | undefined => ctx.world.entities.find((e) => e.id === id);
const onTarget = (s: GridPushState, t: Tile): boolean => s.targets.some((g) => g.x === t.x && g.y === t.y);

function snapAll(s: GridPushState, ctx: SimCtx): void {
  const ts = ctx.map.tileSize;
  place(ctx.world.player, s.player, ts);
  for (const c of s.crates) {
    const e = entity(ctx, c.id);
    if (!e) continue;
    place(e, c, ts);
    e.tint = onTarget(s, c) ? 'ui' : 'accent';
  }
}

function hud(s: GridPushState, ctx: SimCtx): void {
  const placed = s.targets.filter((t) => s.crates.some((c) => c.x === t.x && c.y === t.y)).length;
  ctx.world.hud['moves'] = s.moves;
  ctx.world.hud['pushes'] = s.pushes;
  ctx.world.hud['placed'] = `${placed}/${s.targets.length}`;
}

function tryStep(s: GridPushState, ctx: SimCtx, d: Dir): void {
  const v = DIR_VEC[d];
  const p = ctx.world.player;
  if (v.dx !== 0) p.facing = v.dx;
  const to = { x: s.player.x + v.dx, y: s.player.y + v.dy };
  if (blocked(ctx, to)) {
    ctx.emit('custom:bump', { x: to.x, y: to.y });
    return;
  }
  const crate = s.crates.find((c) => c.x === to.x && c.y === to.y);
  if (crate) {
    const beyond = { x: to.x + v.dx, y: to.y + v.dy };
    if (blocked(ctx, beyond) || s.crates.some((c) => c.x === beyond.x && c.y === beyond.y)) {
      ctx.emit('custom:bump', { x: to.x, y: to.y, crate: crate.id });
      return;
    }
    crate.x = beyond.x;
    crate.y = beyond.y;
    s.pushes++;
    const e = entity(ctx, crate.id);
    if (e) e.tint = onTarget(s, crate) ? 'ui' : 'accent';
    ctx.emit('push', { crate: crate.id, x: beyond.x, y: beyond.y, onTarget: onTarget(s, crate) });
  }
  s.player = to;
  s.moves++;
  s.history.push({ dx: v.dx, dy: v.dy, crate: crate ? crate.id : -1 });
  if (s.history.length > MAX_HISTORY) s.history.shift();
  s.motion = { t: 0, dx: v.dx, dy: v.dy, crate: crate ? crate.id : -1 };
  p.anim = 'run';
  ctx.emit('move', { x: to.x, y: to.y, moves: s.moves, pushes: s.pushes });
  hud(s, ctx);
}

function advance(s: GridPushState, ctx: SimCtx, stepTicks: number): void {
  const m = s.motion;
  if (!m) return;
  m.t++;
  const ts = ctx.map.tileSize;
  const back = Math.max(0, 1 - m.t / stepTicks);
  place(ctx.world.player, s.player, ts, back, m.dx, m.dy);
  const crate = m.crate >= 0 ? s.crates.find((c) => c.id === m.crate) : undefined;
  const e = crate ? entity(ctx, crate.id) : undefined;
  if (crate && e) place(e, crate, ts, back, m.dx, m.dy);
  if (back > 0) return;
  s.motion = null;
  ctx.world.player.anim = 'idle';
  if (s.targets.length > 0 && s.targets.every((t) => s.crates.some((c) => c.x === t.x && c.y === t.y))) {
    s.done = true;
    const w = ctx.world;
    w.flags.won = true;
    w.score += intParam(ctx, 'bonus', 0, 100, 10);
    ctx.emit('level_complete', { level: w.levelId, score: w.score, moves: s.moves, pushes: s.pushes, deaths: w.deaths });
  }
}

function undo(s: GridPushState, ctx: SimCtx): void {
  const last = s.history.pop();
  if (!last) return;
  s.player = { x: s.player.x - last.dx, y: s.player.y - last.dy };
  const crate = last.crate >= 0 ? s.crates.find((c) => c.id === last.crate) : undefined;
  if (crate) {
    crate.x -= last.dx;
    crate.y -= last.dy;
    s.pushes--;
  }
  s.moves--;
  snapAll(s, ctx);
  ctx.emit('undo', { moves: s.moves, pushes: s.pushes });
  hud(s, ctx);
}

function restart(s: GridPushState, ctx: SimCtx): void {
  s.player = { ...s.start.player };
  s.crates = s.start.crates.map((c) => ({ ...c }));
  s.history = [];
  s.moves = 0;
  s.pushes = 0;
  s.queued = null;
  snapAll(s, ctx);
  ctx.emit('undo', { moves: 0, pushes: 0, restart: true });
  hud(s, ctx);
}

/**
 * Sokoban rules on the tilemap: the player steps one tile per press (held keys repeat), walks into a crate to push it
 * one tile if the tile beyond is free floor, and never pulls. Steps slide over `stepTicks`; a press during a slide is
 * buffered. `action` undoes the last move, `dash` restarts the level. The level is solved when every target holds a
 * crate. Emits move, push, undo, custom:bump and level_complete.
 */
export const gridPush = defineSystem<GridPushState>({
  id: 'grid-push',
  init(ctx) {
    const ts = ctx.map.tileSize;
    const player = tileOf(ctx.world.player, ts);
    const crates = ctx.world.entities.filter((e) => e.type === CRATE_TYPE).map((e) => ({ id: e.id, ...tileOf(e, ts) }));
    const targets = ctx.world.entities.filter((e) => e.type === TARGET_TYPE).map((e) => tileOf(e, ts));
    for (const e of ctx.world.entities) if (e.type === TARGET_TYPE) place(e, tileOf(e, ts), ts);
    const s: GridPushState = {
      player,
      crates,
      targets,
      start: { player: { ...player }, crates: crates.map((c) => ({ ...c })) },
      motion: null,
      queued: null,
      held: null,
      heldTicks: 0,
      prev: 0,
      history: [],
      moves: 0,
      pushes: 0,
      done: false,
    };
    snapAll(s, ctx);
    hud(s, ctx);
    return s;
  },
  fixedUpdate(s, input, ctx) {
    const bits = bitsOf(input);
    const pressed = bits & ~s.prev;
    s.prev = bits;
    if (s.done) return;
    const stepTicks = intParam(ctx, 'stepTicks', 2, 20, 6);
    const repeatDelay = intParam(ctx, 'repeatDelayTicks', 4, 60, 14);
    const repeatEvery = intParam(ctx, 'repeatTicks', 2, 30, 6);
    // A fresh press wins; a direction still held repeats after the delay.
    let intent: Dir | null = null;
    for (const [bit, d] of DIR_BITS) if (pressed & bit) intent = d;
    if (intent) {
      s.held = intent;
      s.heldTicks = 0;
    } else if (s.held && bits & BIT[s.held]) {
      s.heldTicks++;
      if (s.heldTicks >= repeatDelay && (s.heldTicks - repeatDelay) % repeatEvery === 0) intent = s.held;
    } else {
      s.held = null;
      s.heldTicks = 0;
    }
    if (s.motion) {
      if (intent && s.queued === null && pressed) s.queued = intent;
      advance(s, ctx, stepTicks);
      return;
    }
    if (pressed & BIT.action && ctx.params['allowUndo'] !== false) {
      undo(s, ctx);
      return;
    }
    if (pressed & BIT.dash) {
      restart(s, ctx);
      return;
    }
    const next = intent ?? s.queued;
    s.queued = null;
    if (next) tryStep(s, ctx, next);
  },
});

export const meta = {
  id: 'grid-push',
  genres: ['puzzle'],
  required: true,
  summary: 'Sokoban rules: one tile per step, push one crate at a time, undo and restart; solved when every target holds a crate.',
  params: {
    stepTicks: { type: 'number', min: 2, max: 20, default: 6, affects: 'none' },
    repeatDelayTicks: { type: 'number', min: 4, max: 60, default: 14, affects: 'none' },
    repeatTicks: { type: 'number', min: 2, max: 30, default: 6, affects: 'none' },
    allowUndo: { type: 'boolean', default: true, affects: 'none' },
    bonus: { type: 'number', min: 0, max: 100, default: 10, affects: 'none' },
  },
  emits: ['move', 'push', 'undo', 'level_complete'],
  feedbackFor: ['move', 'push', 'undo', 'level_complete'],
} as const;
