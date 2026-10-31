import { MoveSet, type Move } from '@gg/schemas';
import { approach, cancelInto, cancelOpensWithin, centerX, defineSystem, endMove, isHostile, moveOf, moveTick, startMove, stepMove, type Entity } from '@gg/sdk';
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

interface CombatState {
  /** The game's moves by id (content/moves.json, else the castle's own). */
  moves: Map<string, Move>;
  prevAction: boolean;
  /** Ticks a press is still held for a chain's window to open. */
  buffered: number;
  /** Ticks the hero still reels from a blow. */
  hurt: number;
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

/** The last cut of a chain (one a chain leads into and that leads nowhere): its swing sounds heavier. */
function finisher(m: Move, moves: ReadonlyMap<string, Move>): boolean {
  return m.cancels.length === 0 && [...moves.values()].some((o) => o.cancels.some((c) => c.into.includes(m.id)));
}

/**
 * The castle's sword, on the action key, from the game's moves (content/moves.json, a MoveSet).
 * - On the ground the key starts the chain, and a press in a cut's window (or up to BUFFER_TICKS before it opens) goes
 *   on to the next. In the air it is the air cut, or with down held the plunge, which bounces the hero off what it
 *   strikes.
 * - A cut faces the way the hero is pressing as it starts, and roots it on the ground but for the cut's own step, which
 *   stops at a ledge. A dash cuts it short from its dash-cancel tick.
 * - Each cut strikes each foe once: thrown back, staggered (its behaviour holds), the world held a moment as it lands.
 * - A blow on the hero throws it back, reeling for HURT_TICKS (HURT_AIR_TICKS in the air), its cut broken off.
 */
export const combat = defineSystem<CombatState>({
  id: 'combat',
  init: (ctx) => {
    const set = MoveSet.safeParse(ctx.content['moves']);
    return { moves: new Map((set.success ? set.data : DEFAULT_MOVES).moves.map((m) => [m.id, m])), prevAction: false, buffered: 0, hurt: 0 };
  },
  fixedUpdate(s, input, ctx) {
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
    "Sword combat on the action key from the game's moves (content/moves.json): a chain of cuts on the ground, a cut in the air and, with down, a plunge that bounces off what it strikes. Each cut roots the hero but for its own step, strikes each foe once, throws it back and staggers it; a blow throws the hero back, reeling.",
  params: {},
  emits: ['hit', 'damage', 'death', 'custom:swing', 'custom:finisher'],
  feedbackFor: ['hit', 'custom:swing', 'custom:finisher'],
  controls: { action: 'attack', down: 'plunge (in the air)', left: 'face', right: 'face' },
  provides: { combat: 'melee' },
  requires: { movement: ['platformer'], roles: ['hostile'] },
} as const;
