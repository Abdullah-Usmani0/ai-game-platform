import { centerX, centerY, defineSystem, overlaps, type Entity } from '@gg/sdk';
import { isHostile } from '../entities.js';

interface MeleeState {
  cooldown: number;
  dirX: number;
  dirY: number;
  attackTicks: number;
  swings: number;
  hits: number;
  /** Place of the last swing in the chain (1-3); the third is the finisher. */
  chain: number;
  /** Ticks after a swing's recovery in which the next swing still continues the chain. */
  chainWindow: number;
  /** Ticks since the player last dashed: a swing within DASH_STRIKE_TICKS of a dash is a dash-strike. */
  sinceDash: number;
}

const CHAIN_WINDOW_TICKS = 14;
const DASH_STRIKE_TICKS = 8;

/** A boon-scaled number on the player (boons write these props; they carry into the next floor). */
const prop = (p: Entity, key: string, base: number): number => (typeof p.props[key] === 'number' ? (p.props[key] as number) : base);

/**
 * Directional melee in a three-hit chain on the action key. Swings that follow each other closely chain, and the
 * third (the finisher) hits harder, reaches further and throws foes back, for a longer recovery. A swing during or just
 * after a dash is a dash-strike: a lunge that reaches further and hits harder. Every hostile inside the swing box is
 * damaged and shoved (a boss barely moves); projectiles in it are destroyed (a parry). Boons on the player (atkBonus,
 * reachMul, cdMul, knockMul) scale every swing. Holding the key swings on cooldown.
 */
export const meleeAttack = defineSystem<MeleeState>({
  id: 'melee-attack',
  init: () => ({ cooldown: 0, dirX: 1, dirY: 0, attackTicks: 0, swings: 0, hits: 0, chain: 0, chainWindow: 0, sinceDash: 999 }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      s.dirX = dx / len;
      s.dirY = dy / len;
    }
    if (s.cooldown > 0) s.cooldown--;
    else if (s.chainWindow > 0) s.chainWindow--;
    s.sinceDash = p.flags['dashing'] ? 0 : Math.min(999, s.sinceDash + 1);
    if (s.attackTicks > 0) {
      s.attackTicks--;
      if (s.attackTicks === 0) p.anim = 'idle';
    }
    if (!input.action || s.cooldown > 0) return;
    const lunge = ctx.params['dashStrike'] !== false && s.sinceDash <= DASH_STRIKE_TICKS;
    s.chain = lunge ? 0 : ctx.params['combo'] !== false && s.chainWindow > 0 ? (s.chain % 3) + 1 : 1;
    const finisher = s.chain === 3;
    const kind = lunge ? 'lunge' : finisher ? 'finisher' : 'swing';
    const range = Number(ctx.params['range'] ?? 14) * prop(p, 'reachMul', 1) * (lunge ? 1.4 : finisher ? 1.25 : 1);
    const damage = Number(ctx.params['damage'] ?? 1) + prop(p, 'atkBonus', 0) + (lunge || finisher ? Number(ctx.params['finisherBonus'] ?? 1) : 0);
    const knockback = Number(ctx.params['knockback'] ?? 6) * prop(p, 'knockMul', 1) * (finisher ? 2 : lunge ? 1.5 : 1);
    const recovery = Math.max(1, Math.round(Number(ctx.params['cooldownTicks'] ?? 18) * prop(p, 'cdMul', 1)));
    s.cooldown = finisher ? Math.round(recovery * 1.6) : recovery;
    s.chainWindow = CHAIN_WINDOW_TICKS;
    s.attackTicks = 6;
    s.swings++;
    p.anim = 'attack';
    // Aim assist: a hostile within 1.5x range pulls the swing toward it (humans get the same forgiveness).
    let aimX = s.dirX;
    let aimY = s.dirY;
    if (ctx.params['autoAim'] !== false) {
      let nearest = range * 1.5;
      for (const e of ctx.world.entities) {
        if (!isHostile(e)) continue;
        const ex = centerX(e) - centerX(p);
        const ey = centerY(e) - centerY(p);
        const d = Math.hypot(ex, ey);
        if (d < nearest && d > 0) {
          nearest = d;
          aimX = ex / d;
          aimY = ey / d;
        }
      }
    }
    ctx.emit('custom:swing', { x: p.x, y: p.y, dirX: aimX, dirY: aimY, kind, chain: s.chain });
    const cx = centerX(p) + aimX * range * (lunge ? 0.75 : 0.6);
    const cy = centerY(p) + aimY * range * (lunge ? 0.75 : 0.6);
    const box = { x: cx - range / 2, y: cy - range / 2, w: range, h: range };
    let landed = 0;
    for (const e of ctx.world.entities) {
      if (e.isPlayer || !e.alive || e.pickup) continue;
      if (!overlaps(box, e)) continue;
      if (e.isProjectile) {
        e.alive = false;
        ctx.emit('despawn', { entity: e.id, type: e.type, parried: true });
        continue;
      }
      ctx.damage(e, damage, p);
      s.hits++;
      landed++;
      const ex = centerX(e) - centerX(p);
      const ey = centerY(e) - centerY(p);
      const len = Math.hypot(ex, ey) || 1;
      const shove = e.flags['boss'] ? knockback * 0.15 : knockback;
      ctx.move(e, (ex / len) * shove, (ey / len) * shove);
    }
    // The heavy hits get their own feedback (a bigger hitstop and shake than an ordinary hit).
    if (landed > 0 && kind !== 'swing') ctx.emit('custom:finisher', { x: cx, y: cy, kind, hits: landed });
  },
});

export const meta = {
  id: 'melee-attack',
  genres: ['topdown-action', 'roguelike'],
  required: true,
  summary:
    'Directional melee in a three-hit chain on the action key (the third is a heavy finisher); a swing right after a dash is a lunging dash-strike; damages and shoves hostiles in front of the player, parries projectiles; boons scale it.',
  params: {
    damage: { type: 'number', min: 1, max: 10, default: 1, affects: 'levels' },
    range: { type: 'number', min: 8, max: 40, default: 14, affects: 'levels' },
    cooldownTicks: { type: 'number', min: 6, max: 60, default: 18, affects: 'levels' },
    knockback: { type: 'number', min: 0, max: 24, default: 6, affects: 'none' },
    autoAim: { type: 'boolean', default: true, affects: 'none' },
    combo: { type: 'boolean', default: true, affects: 'levels' },
    dashStrike: { type: 'boolean', default: true, affects: 'levels' },
    finisherBonus: { type: 'number', min: 0, max: 5, default: 1, affects: 'levels' },
  },
  emits: ['hit', 'damage', 'death', 'despawn', 'custom:swing', 'custom:finisher'],
  feedbackFor: ['hit', 'custom:finisher'],
  controls: { action: 'attack', left: 'aim', right: 'aim', up: 'aim', down: 'aim' },
  provides: { combat: 'melee' },
  requires: { movement: ['topdown'], roles: ['hostile'] },
} as const;
