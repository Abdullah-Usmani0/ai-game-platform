import { z } from 'zod';
import { Id } from './common';

/** Ticks of a move: counted from its first tick, or from its first active tick for a hitbox. */
const Tick = z.int().min(0).max(240);

/**
 * A box a move hits with, from active tick `from` to `to` (counted from its first active tick, both included). Placed
 * from the owner's feet, at the middle of its body, as it faces right: `x` forward from the middle (a facing to the left
 * mirrors it), `y` up from the feet as a negative number (-40 is 40 px above them).
 */
export const HitBox = z.object({
  from: z.int().min(0).max(59),
  to: z.int().min(0).max(59),
  x: z.int().min(-96).max(160),
  y: z.int().min(-192).max(32),
  w: z.int().min(1).max(192),
  h: z.int().min(1).max(192),
});
export type HitBox = z.infer<typeof HitBox>;

/** The owner's own motion from tick `from` to `to` of the move: forward at `vx` px/s, and a kick of `vy` at `from`. */
export const MoveMotion = z.object({
  from: Tick,
  to: Tick,
  vx: z.number().min(-600).max(600),
  vy: z.number().min(-900).max(900).optional(),
});
export type MoveMotion = z.infer<typeof MoveMotion>;

/** While the move's tick is from `from` to `to`, pressing the input of one of `into` starts it (a chain). */
export const MoveCancel = z.object({
  into: z.array(Id).min(1).max(4),
  from: Tick,
  to: Tick,
});
export type MoveCancel = z.infer<typeof MoveCancel>;

/**
 * One move: who makes it, the clip it is drawn with, and its frame data. A move winds up for `startup` ticks, hits for
 * `active` ticks, then recovers for `recovery`. The sim and the drawing follow the same clock, so what is seen to hit is
 * what hits.
 */
export const Move = z.object({
  id: Id,
  /** `player`, or the entity type that makes it (an enemy plays its clip to make it). */
  owner: Id,
  /** The owner's clip: an enemy's behaviour starts the move by playing it. */
  anim: Id,
  /**
   * The hero's moves: what starts it (the attack key on the ground, in the air, with down in the air, on a foe its parry
   * turned; the guard key, a parry; the item key, a flask).
   */
  input: z.enum(['attack', 'air', 'plunge', 'riposte', 'guard', 'item']).optional(),
  startup: z.int().min(1).max(120),
  /** Up to a second: a leap's blow lasts its whole flight (it ends as the owner lands). */
  active: z.int().min(1).max(60),
  recovery: z.int().min(0).max(120),
  hitboxes: z.array(HitBox).max(4),
  damage: z.int().min(0).max(20),
  /** Thrown back from the attacker (x, px/s) and up (y, px/s, zero or negative). */
  knockback: z.object({ x: z.int().min(0).max(600), y: z.int().min(-600).max(0) }),
  /** Ticks a struck foe is staggered: its behaviour holds and it cannot act. */
  hitstun: z.int().min(0).max(90),
  /** Ticks the world holds still as the blow lands. */
  hitstop: z.int().min(0).max(8),
  /** How much of a foe's poise (a boss's guard against flinching) the blow takes. */
  poise: z.int().min(0).max(100).default(0),
  motion: z.array(MoveMotion).max(4).default([]),
  cancels: z.array(MoveCancel).max(4).default([]),
  /** From this tick on a dash ends the move (none: only once it is over). */
  dashCancel: Tick.optional(),
  /** Ends early when the owner lands (a plunge). */
  endsOnLanding: z.boolean().default(false),
  /** A parry turns it aside, staggering its owner. */
  parryable: z.boolean().default(false),
  /** Ticks of the move in which its owner takes no damage. */
  iframes: z.object({ from: Tick, to: Tick }).optional(),
  /** Magic it costs the hero. */
  mp: z.int().min(0).max(100).default(0),
  /** Hearts it restores to its owner at its first active tick (a flask drunk). */
  heal: z.int().min(0).max(20).default(0),
  /**
   * A shot loosed at tick `at` from the owner's front, at `speed` px/s forward (and `vy` up or down), its middle at the
   * owner's middle, or `y` px up from its feet as a negative number (a wave along the floor; a shot that touches the
   * floor is spent, so its lowest pixel stays above the feet).
   */
  projectile: z.object({ type: Id, at: Tick, speed: z.number().min(10).max(900), vy: z.number().min(-900).max(900).optional(), y: z.int().min(-192).max(0).optional() }).optional(),
});
export type Move = z.infer<typeof Move>;

/** All of a move's ticks: startup, active and recovery. */
export function moveLength(m: Pick<Move, 'startup' | 'active' | 'recovery'>): number {
  return m.startup + m.active + m.recovery;
}

/**
 * content/moves.json: the frame data of every move in the game, the hero's and its cast's. Ids are unique; every tick a
 * move names lies inside it, and a cancel names a move of the same owner.
 */
export const MoveSet = z
  .object({
    version: z.literal(1),
    moves: z.array(Move).min(1).max(32),
  })
  .superRefine((set, ctx) => {
    const byId = new Map(set.moves.map((m) => [m.id, m]));
    if (byId.size !== set.moves.length) ctx.addIssue({ code: 'custom', message: 'move ids must be unique', path: ['moves'] });
    set.moves.forEach((m, i) => {
      const at = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', message: `${m.id}: ${message}`, path: ['moves', i, ...path] });
      const n = moveLength(m);
      m.hitboxes.forEach((b, j) => {
        if (b.from > b.to || b.to >= m.active) at(['hitboxes', j], `a hitbox's ticks run from ${b.from} to ${b.to}, inside the ${m.active} active ticks`);
      });
      m.motion.forEach((s, j) => {
        if (s.from > s.to || s.to >= n) at(['motion', j], `motion ticks ${s.from}-${s.to} lie outside the move's ${n}`);
      });
      m.cancels.forEach((c, j) => {
        if (c.from > c.to || c.to >= n) at(['cancels', j], `cancel ticks ${c.from}-${c.to} lie outside the move's ${n}`);
        for (const into of c.into) if (byId.get(into)?.owner !== m.owner) at(['cancels', j], `cancels into '${into}', not a move of ${m.owner}`);
      });
      if (m.dashCancel !== undefined && m.dashCancel >= n) at(['dashCancel'], `the dash cancel at ${m.dashCancel} lies outside the move's ${n} ticks`);
      if (m.iframes && (m.iframes.from > m.iframes.to || m.iframes.to >= n)) at(['iframes'], `i-frames ${m.iframes.from}-${m.iframes.to} lie outside the move's ${n} ticks`);
      if (m.projectile && m.projectile.at >= n) at(['projectile'], `the shot at ${m.projectile.at} lies outside the move's ${n} ticks`);
      if (m.owner === 'player' && !m.input) at(['input'], "a move of the player's says which input starts it");
      if (m.owner !== 'player' && m.input) at(['input'], 'only the hero takes inputs');
    });
  });
export type MoveSet = z.infer<typeof MoveSet>;
