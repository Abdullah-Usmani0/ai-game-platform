import { MoveSet, type Move } from '@gg/schemas';
import { approach, cancelInto, cancelOpensWithin, centerX, defineSystem, endMove, isHostile, moveOf, moveTick, startMove, stepMove, type Entity, type SimCtx } from '@gg/sdk';
import { GUARDS } from '../entities.js';
import { DEFAULT_MOVES } from '../moves.js';

/**
 * The prop the castle's movement reads (createMovement's `lock`): 1 while the hero commits to a cut or reels from a
 * blow, 2 once a dash may cut the cut short, 0 when it moves freely.
 */
export const LOCK = '_lock';
/**
 * Ticks the hero reels from a blow: thrown back, no cut, no control. Struck in the air it gets its air control back
 * sooner, so a blow over a pit is a scare, not a fall.
 */
export const HURT_TICKS = 18;
export const HURT_AIR_TICKS = 8;
/** A press this many ticks before a chain's next window opens is held for it. */
export const BUFFER_TICKS = 6;
/** The bounce a plunge gives the hero off what it strikes (px/s, up). */
export const PLUNGE_BOUNCE = -300;
/** How a blow throws the hero (px/s) and how fast that slides out (px/s²). */
const HURT_KNOCK = { x: 150, y: -170 };
const HURT_FRICTION = 700;
/** The behaviour state entry a foe last started a move on (FsmRuntime.entries): one entry makes one move. */
const MOVE_ENTRY = '_moveEntry';
/**
 * A blow a shield turns aside: the hero is thrown back (px/s) and cannot act for BLOCK_TICKS, unhurt, and the world
 * holds a moment as steel rings on steel.
 */
export const BLOCK_TICKS = 12;
const BLOCK_KNOCK = 170;
const BLOCK_HITSTOP = 3;
/** Ticks a foe reels once its guard breaks; ticks without a block after which its guard is whole again. */
export const GUARD_BREAK_TICKS = 50;
export const GUARD_REFILL_TICKS = 120;
/** A shield's guard left (in poise), and the tick it last turned a blow aside. */
export const GUARD = '_guard';
export const GUARD_AT = '_guardAt';

interface CombatState {
  /** The game's moves by id (content/moves.json, else the castle's own). */
  moves: Map<string, Move>;
  /** The cast's moves by their owner and clip (`ghoul/claw`): a behaviour that plays one makes it. */
  byClip: Map<string, Move>;
  prevAction: boolean;
  /** Ticks a press is still held for a chain's window to open. */
  buffered: number;
  /** Ticks the hero still reels from a blow. */
  hurt: number;
}

/**
 * Whether a foe's shield is up: it carries one (GUARDS), is not reeling, and is not past the startup of a move of its own
 * (a thrust swings the shield open, and it stays open as the foe recovers).
 */
export function guardUp(e: Entity, moves: ReadonlyMap<string, Move>): boolean {
  if (GUARDS[e.type] === undefined || !e.alive || (e.stunTicks ?? 0) > 0) return false;
  const m = moveOf(e, moves);
  return !m || moveTick(e) < m.startup;
}

/** The move the attack key starts from nothing: the chain's first on the ground; in the air the plunge with down held, else the air cut. */
function opener(p: Entity, down: boolean, moves: ReadonlyMap<string, Move>): Move | null {
  const hero = [...moves.values()].filter((m) => m.owner === 'player');
  if (p.grounded) {
    const chained = new Set(hero.flatMap((m) => m.cancels.flatMap((c) => c.into)));
    return hero.find((m) => m.input === 'attack' && !chained.has(m.id)) ?? null;
  }
  return (down ? hero.find((m) => m.input === 'plunge') : undefined) ?? hero.find((m) => m.input === 'air') ?? null;
}

/**
 * The cast's moves, a tick of each: a foe whose behaviour enters a state playing one of its moves' clips makes that move
 * (once an entry, and not while staggered), on its own clock, against the hero. On the ground the move moves the body
 * only through its motion; over or broken off, the body stops.
 */
function stepCast(s: CombatState, ctx: SimCtx): void {
  const p = ctx.world.player;
  for (const e of ctx.world.entities) {
    if (!e.alive || e.isPlayer || e.dormant === true || !e.fsm) continue;
    let m = moveOf(e, s.moves);
    const entry = e.fsm.entries ?? 0;
    if (!m && e.props[MOVE_ENTRY] !== entry && (e.stunTicks ?? 0) === 0) {
      const named = s.byClip.get(`${e.type}/${e.anim}`);
      if (named) {
        startMove(e, named);
        e.props[MOVE_ENTRY] = entry;
        m = named;
      }
    }
    if (m) {
      // On the ground a move carries the body only through its motion: the rest of it, the body stands.
      const t = moveTick(e);
      if (e.grounded && !m.motion.some((x) => t >= x.from && t <= x.to)) e.vx = 0;
      stepMove(ctx, e, m, p.alive ? [p] : []);
      if (!moveOf(e, s.moves) && e.grounded && (e.stunTicks ?? 0) === 0) e.vx = 0;
    }
    // A shield: whole again a while after its last block; whether it is up, for the view and the bots.
    const full = GUARDS[e.type];
    if (full !== undefined) {
      const at = e.props[GUARD_AT];
      if (typeof at === 'number' && ctx.tick - at >= GUARD_REFILL_TICKS) e.props[GUARD] = full;
      e.flags['guarding'] = guardUp(e, s.moves);
    }
  }
}

/** The last cut of a chain (one a chain leads into and that leads nowhere): its swing sounds heavier. */
function finisher(m: Move, moves: ReadonlyMap<string, Move>): boolean {
  return m.cancels.length === 0 && [...moves.values()].some((o) => o.cancels.some((c) => c.into.includes(m.id)));
}

/**
 * The castle's sword, on the action key, from the game's moves (content/moves.json, a MoveSet), and its cast's moves.
 * - On the ground the key starts the chain, and a press in a cut's window (or up to BUFFER_TICKS before it opens) goes
 *   on to the next. In the air it is the air cut, or with down held the plunge, which bounces the hero off what it
 *   strikes.
 * - A cut faces the way the hero is pressing as it starts, and roots it on the ground but for the cut's own step, which
 *   stops at a ledge. A dash cuts it short from its dash-cancel tick.
 * - Each cut strikes each foe once: thrown back, staggered (its behaviour holds), the world held a moment as it lands.
 * - A shield (GUARDS) turns aside a blow from the side its bearer faces while its guard is up: the cut ends, the hero
 *   is thrown back unhurt, and the guard gives by the blow's poise; at nothing it breaks, the blow lands and the bearer
 *   reels for GUARD_BREAK_TICKS. Over its head (the plunge) or at its back the shield does not cover it, nor once the
 *   bearer's own thrust has swung it open.
 * - A blow on the hero throws it back, reeling for HURT_TICKS (HURT_AIR_TICKS in the air), its cut broken off.
 */
export const combat = defineSystem<CombatState>({
  id: 'combat',
  init: (ctx) => {
    const set = (MoveSet.safeParse(ctx.content['moves']).data ?? DEFAULT_MOVES).moves;
    return {
      moves: new Map(set.map((m) => [m.id, m])),
      byClip: new Map(set.filter((m) => m.owner !== 'player').map((m) => [`${m.owner}/${m.anim}`, m])),
      prevAction: false,
      buffered: 0,
      hurt: 0,
    };
  },
  fixedUpdate(s, input, ctx) {
    stepCast(s, ctx);
    const p = ctx.world.player;
    // The keys the sword reads, every tick: the attack, down for the plunge, and the arrows a cut faces by.
    const pressed = input.action && !s.prevAction;
    const down = input.down;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    s.prevAction = input.action;
    if (!p.alive) {
      endMove(p);
      p.props[LOCK] = 0;
      s.hurt = 0;
      s.buffered = 0;
      return;
    }
    if (s.hurt > 0) {
      s.hurt--;
      p.vx = approach(p.vx, 0, HURT_FRICTION * ctx.dt);
      p.props[LOCK] = s.hurt > 0 ? 1 : 0;
      return;
    }
    let m = moveOf(p, s.moves);
    if (m && p.flags['dashing'] === true) {
      endMove(p);
      m = null;
    }
    if (pressed || s.buffered > 0) {
      const next = m ? cancelInto(m, moveTick(p), s.moves, (n) => n.input === (p.grounded ? 'attack' : 'air')) : pressed ? opener(p, down, s.moves) : null;
      if (next) {
        if (dir !== 0) p.facing = dir;
        startMove(p, next);
        m = next;
        s.buffered = 0;
      } else if (pressed && m && cancelOpensWithin(m, moveTick(p), BUFFER_TICKS)) s.buffered = BUFFER_TICKS;
      else if (s.buffered > 0) s.buffered--;
    }
    if (!m) {
      p.props[LOCK] = 0;
      return;
    }
    const t = moveTick(p);
    if (t === m.startup) ctx.emit(finisher(m, s.moves) ? 'custom:finisher' : 'custom:swing', { entity: p.id, move: m.id });
    const strikes = stepMove(ctx, p, m, ctx.world.entities.filter((e) => isHostile(e) && e.dormant !== true));
    // Turned aside by a shield (onDamage): the cut is over and the hero is thrown back.
    if (s.hurt > 0) {
      p.props[LOCK] = 1;
      return;
    }
    // A foe staggered out of its own move reels rather than going on drawing it.
    for (const x of strikes) if (x.staggered && !x.target.isPlayer && s.byClip.has(`${x.target.type}/${x.target.anim}`)) x.target.anim = 'hurt';
    // Rooted on the ground but for the cut's own step, which stops where the floor does (no cut carries the hero off a ledge).
    if (m.input === 'attack' || m.input === 'riposte') {
      const stepping = m.motion.some((x) => t >= x.from && t <= x.to);
      const front = p.facing < 0 ? p.x - 1 : p.x + p.w + 1;
      const floor = ctx.map.kindAtPx(front, p.y + p.h + 1);
      if (!stepping || (p.grounded && floor !== 'solid' && floor !== 'oneway')) p.vx = 0;
    }
    if (m.input === 'plunge' && strikes.some((x) => x.landed)) {
      endMove(p);
      p.vy = PLUNGE_BOUNCE;
    }
    const now = moveOf(p, s.moves);
    p.props[LOCK] = !now || now.input === 'air' ? 0 : now.dashCancel !== undefined && moveTick(p) >= now.dashCancel ? 2 : 1;
  },
  onDamage(s, hit, ctx) {
    const { target, source } = hit;
    const full = GUARDS[target.type];
    if (full === undefined || !source || !source.isPlayer || !guardUp(target, s.moves)) return hit.amount;
    const blow = moveOf(source, s.moves);
    if (!blow) return hit.amount;
    // Over its head (the plunge) or at its back, the shield does not cover it.
    if (source.y + source.h <= target.y + 6 || (centerX(source) - centerX(target)) * target.facing <= 0) return hit.amount;
    const was = target.props[GUARD];
    const left = (typeof was === 'number' ? was : full) - blow.poise;
    target.props[GUARD_AT] = ctx.tick;
    if (left <= 0) {
      // The guard breaks: this blow lands, the shield knocked aside, and the bearer reels, its own move broken off.
      target.props[GUARD] = full;
      target.stunTicks = Math.max(target.stunTicks ?? 0, GUARD_BREAK_TICKS);
      endMove(target);
      target.flags['guarding'] = false;
      ctx.emit('custom:guard_break', { entity: target.id });
      return hit.amount;
    }
    target.props[GUARD] = left;
    // Turned aside: the cut ends and the hero is thrown back, unhurt; the world holds as steel rings.
    endMove(source);
    s.hurt = BLOCK_TICKS;
    s.buffered = 0;
    source.vx = (centerX(source) >= centerX(target) ? 1 : -1) * BLOCK_KNOCK;
    source.props[LOCK] = 1;
    ctx.world.hitstop = Math.max(ctx.world.hitstop ?? 0, BLOCK_HITSTOP);
    ctx.emit('custom:block', { entity: target.id });
    return 0;
  },
  onEvent(s, ev, ctx) {
    const p = ctx.world.player;
    if (ev.name !== 'hit' || ev.payload['target'] !== p.id || !p.alive) return;
    // Struck: thrown back from the blow, reeling, the cut broken off.
    const from = ctx.world.entities.find((e) => e.id === ev.payload['source']);
    const away = from ? (centerX(p) >= centerX(from) ? 1 : -1) : -p.facing;
    endMove(p);
    s.hurt = p.grounded ? HURT_TICKS : HURT_AIR_TICKS;
    s.buffered = 0;
    p.vx = away * HURT_KNOCK.x;
    p.vy = Math.min(p.vy, HURT_KNOCK.y);
    p.props[LOCK] = 1;
  },
});

export const meta = {
  id: 'combat',
  genres: ['castle'],
  required: true,
  summary:
    "Sword combat on the action key from the game's moves (content/moves.json): a chain of cuts on the ground, a cut in the air and, with down, a plunge that bounces off what it strikes. Each cut roots the hero but for its own step, strikes each foe once, throws it back and staggers it; a blow throws the hero back, reeling. The cast's attacks are moves too, each made by a behaviour state that plays its clip, each winding up long enough to read. A shield-bearer turns aside blows from the front until its guard breaks; over its head, at its back, or once its own thrust swings the shield open, blows land.",
  params: {},
  // A foe's move that looses a shot (the gargoyle's spit) spawns it.
  emits: ['hit', 'damage', 'death', 'spawn', 'custom:swing', 'custom:finisher', 'custom:block', 'custom:guard_break'],
  feedbackFor: ['hit', 'custom:swing', 'custom:finisher', 'custom:block', 'custom:guard_break'],
  controls: { action: 'attack', down: 'plunge (in the air)', left: 'face', right: 'face' },
  // The shots the castle's moves loose: the gargoyle's embers.
  provides: { combat: 'melee', spawns: ['ember'] },
  requires: { movement: ['platformer'], roles: ['hostile'] },
} as const;
