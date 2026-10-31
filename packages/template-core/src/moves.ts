import { moveLength, type Move, type MoveSet } from '@gg/schemas';
import { centerX, overlaps, type Entity, type SimCtx } from '@gg/sdk';

/**
 * A body's move clock, kept in its props so a save keeps it: the move it is making ('' for none), the tick of it, and
 * who it has struck (their ids, comma-separated: each is struck once a move).
 */
export const MOVE = '_move';
export const MOVE_TICK = '_moveTick';
export const MOVE_HIT = '_moveHit';
/** A foe's poise (what is left of its guard against flinching) and what it returns to once broken. */
export const POISE = '_poise';
export const POISE_MAX = '_poiseMax';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A blow that met its target: whether it landed (not turned aside), and whether it staggered them. */
export interface Strike {
  attacker: Entity;
  target: Entity;
  move: Move;
  landed: boolean;
  staggered: boolean;
}

/** A game's moves by id. */
export function moveMap(set: MoveSet | null | undefined): Map<string, Move> {
  return new Map((set?.moves ?? []).map((m) => [m.id, m]));
}

/** The move a body is making, if any. */
export function moveOf(e: Entity, moves: ReadonlyMap<string, Move>): Move | null {
  const id = e.props[MOVE];
  return typeof id === 'string' && id !== '' ? (moves.get(id) ?? null) : null;
}

/** The tick of the move a body is making (0 when it makes none). */
export function moveTick(e: Entity): number {
  const t = e.props[MOVE_TICK];
  return typeof t === 'number' ? t : 0;
}

/** Where a move is at its tick `t`: winding up, hitting, recovering, or over. */
export function movePhase(m: Move, t: number): 'startup' | 'active' | 'recovery' | 'done' {
  if (t < m.startup) return 'startup';
  if (t < m.startup + m.active) return 'active';
  return t < moveLength(m) ? 'recovery' : 'done';
}

/** A move's boxes at its tick `t`, in the world, for its owner where it stands and as it faces. */
export function hitboxesAt(m: Move, t: number, owner: Pick<Entity, 'x' | 'y' | 'w' | 'h' | 'facing'>): Box[] {
  const a = t - m.startup;
  if (a < 0 || a >= m.active) return [];
  const cx = owner.x + owner.w / 2;
  const feet = owner.y + owner.h;
  return m.hitboxes.filter((b) => a >= b.from && a <= b.to).map((b) => ({ x: owner.facing < 0 ? cx - b.x - b.w : cx + b.x, y: feet + b.y, w: b.w, h: b.h }));
}

/** Starts a move: its clip, its clock at nought, nobody struck yet. */
export function startMove(e: Entity, m: Move): void {
  e.props[MOVE] = m.id;
  e.props[MOVE_TICK] = 0;
  e.props[MOVE_HIT] = '';
  e.anim = m.anim;
}

/** Ends whatever move a body is making. */
export function endMove(e: Entity): void {
  e.props[MOVE] = '';
  e.props[MOVE_TICK] = 0;
  e.props[MOVE_HIT] = '';
}

/** Whether a body is inside its move's i-frames now (a dodge, a boss rising): it takes no damage. */
export function inIframes(e: Entity, moves: ReadonlyMap<string, Move>): boolean {
  const m = moveOf(e, moves);
  if (!m?.iframes) return false;
  const t = moveTick(e);
  return t >= m.iframes.from && t <= m.iframes.to;
}

/**
 * The move a press starts now from a cancel window of the move being made: the first of its `into` that `can` allows,
 * or null when no window is open.
 */
export function cancelInto(m: Move, t: number, moves: ReadonlyMap<string, Move>, can: (next: Move) => boolean): Move | null {
  for (const c of m.cancels) {
    if (t < c.from || t > c.to) continue;
    for (const id of c.into) {
      const next = moves.get(id);
      if (next && can(next)) return next;
    }
  }
  return null;
}

/** Whether a cancel window of the move opens within `ticks` from its tick `t` (a press that early is held for it). */
export function cancelOpensWithin(m: Move, t: number, ticks: number): boolean {
  return m.cancels.some((c) => c.from > t && c.from - t <= ticks);
}

/**
 * A blow meets a target: the damage through the sim (invulnerability and the systems that dodge or parry see it first),
 * then, if it landed, the target thrown back and staggered, unless its poise holds; and the world held for the hitstop.
 * A staggered foe's own move is broken off; the hero's hurt is its game's to deal with.
 */
export function strike(ctx: SimCtx, attacker: Entity, target: Entity, m: Move): Strike {
  const hp = target.hp;
  if (m.damage > 0) ctx.damage(target, m.damage, attacker);
  const landed = m.damage > 0 ? target.hp < hp : target.invulnTicks <= 0;
  if (!landed) return { attacker, target, move: m, landed, staggered: false };
  let staggered = true;
  const poise = target.props[POISE];
  if (typeof poise === 'number') {
    const left = poise - m.poise;
    staggered = left <= 0;
    const full = target.props[POISE_MAX];
    target.props[POISE] = staggered ? (typeof full === 'number' ? full : 0) : left;
  }
  if (staggered && target.alive) {
    target.vx = (centerX(target) >= centerX(attacker) ? 1 : -1) * m.knockback.x;
    if (m.knockback.y < 0) target.vy = Math.min(target.vy, m.knockback.y);
    if (!target.isPlayer && m.hitstun > 0) {
      target.stunTicks = Math.max(target.stunTicks ?? 0, m.hitstun);
      endMove(target);
    }
  }
  if (m.hitstop > 0) ctx.world.hitstop = Math.max(ctx.world.hitstop ?? 0, m.hitstop);
  return { attacker, target, move: m, landed, staggered };
}

/**
 * One tick of a body's move, at the tick its clock shows: its own motion, its boxes against the targets (each struck
 * once a move), a shot at its tick; then the clock moves on. The move ends after its recovery; one that ends on landing
 * goes straight to its recovery when its owner touches down. Returns the blows it dealt, for its game's feedback.
 */
export function stepMove(ctx: SimCtx, e: Entity, m: Move, targets: readonly Entity[]): Strike[] {
  const t = moveTick(e);
  const dir = e.facing < 0 ? -1 : 1;
  for (const s of m.motion) {
    if (t < s.from || t > s.to) continue;
    e.vx = dir * s.vx;
    if (t === s.from && s.vy !== undefined) e.vy = s.vy;
  }
  if (m.projectile && t === m.projectile.at) {
    const def = ctx.defOf(m.projectile.type);
    if (def) {
      const shot = ctx.spawn(m.projectile.type, dir < 0 ? e.x - def.w : e.x + e.w, e.y + e.h / 2 - def.h / 2);
      shot.vx = dir * m.projectile.speed;
      shot.vy = m.projectile.vy ?? 0;
      shot.facing = dir;
    }
  }
  const strikes: Strike[] = [];
  const boxes = hitboxesAt(m, t, e);
  if (boxes.length > 0) {
    const was = e.props[MOVE_HIT];
    const struck = typeof was === 'string' && was !== '' ? was.split(',') : [];
    for (const target of targets) {
      if (!target.alive || target === e || target.dormant === true || struck.includes(String(target.id))) continue;
      if (!boxes.some((b) => overlaps(b, target))) continue;
      struck.push(String(target.id));
      strikes.push(strike(ctx, e, target, m));
    }
    // A blow can break off this very move (a parry staggers the attacker): then its clock is gone.
    if (e.props[MOVE] === m.id) e.props[MOVE_HIT] = struck.join(',');
  }
  if (e.props[MOVE] !== m.id) return strikes;
  const landingEnds = m.endsOnLanding && t > 0 && e.grounded && t < m.startup + m.active;
  const next = landingEnds ? m.startup + m.active : t + 1;
  if (next >= moveLength(m)) endMove(e);
  else e.props[MOVE_TICK] = next;
  return strikes;
}
