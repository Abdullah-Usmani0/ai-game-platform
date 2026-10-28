import { centerX, centerY, defineSystem, overlaps } from '@gg/sdk';
import { isHostile } from '../entities.js';

interface MeleeState {
  cooldown: number;
  dirX: number;
  dirY: number;
  attackTicks: number;
  swings: number;
  hits: number;
}

/**
 * Directional melee swing on the action key: a square hit box in the last movement direction damages every
 * hostile inside it, shoves them back, and destroys projectiles (a parry). Holding the key swings on cooldown.
 */
export const meleeAttack = defineSystem<MeleeState>({
  id: 'melee-attack',
  init: () => ({ cooldown: 0, dirX: 1, dirY: 0, attackTicks: 0, swings: 0, hits: 0 }),
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
    if (s.attackTicks > 0) {
      s.attackTicks--;
      if (s.attackTicks === 0) p.anim = 'idle';
    }
    if (!input.action || s.cooldown > 0) return;
    const range = Number(ctx.params['range'] ?? 14);
    const damage = Number(ctx.params['damage'] ?? 1);
    const knockback = Number(ctx.params['knockback'] ?? 6);
    s.cooldown = Math.max(1, Math.round(Number(ctx.params['cooldownTicks'] ?? 18)));
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
        const dx = centerX(e) - centerX(p);
        const dy = centerY(e) - centerY(p);
        const d = Math.hypot(dx, dy);
        if (d < nearest && d > 0) {
          nearest = d;
          aimX = dx / d;
          aimY = dy / d;
        }
      }
    }
    ctx.emit('custom:swing', { x: p.x, y: p.y, dirX: aimX, dirY: aimY });
    const cx = centerX(p) + aimX * range * 0.6;
    const cy = centerY(p) + aimY * range * 0.6;
    const box = { x: cx - range / 2, y: cy - range / 2, w: range, h: range };
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
      const ex = centerX(e) - centerX(p);
      const ey = centerY(e) - centerY(p);
      const len = Math.hypot(ex, ey) || 1;
      ctx.move(e, (ex / len) * knockback, (ey / len) * knockback);
    }
  },
});

export const meta = {
  id: 'melee-attack',
  genres: ['topdown-action', 'roguelike'],
  required: true,
  summary: 'Directional melee swing on the action key: damages hostiles in a box in front of the player, shoves them, parries projectiles.',
  params: {
    damage: { type: 'number', min: 1, max: 10, default: 1, affects: 'levels' },
    range: { type: 'number', min: 8, max: 40, default: 14, affects: 'levels' },
    cooldownTicks: { type: 'number', min: 6, max: 60, default: 18, affects: 'levels' },
    knockback: { type: 'number', min: 0, max: 24, default: 6, affects: 'none' },
    autoAim: { type: 'boolean', default: true, affects: 'none' },
  },
  emits: ['hit', 'death', 'despawn'],
  feedbackFor: ['hit'],
} as const;
