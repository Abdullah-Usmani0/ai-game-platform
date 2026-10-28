import { defineSystem, overlaps } from '@gg/sdk';

/** Stomp: landing on an enemy's head defeats it and bounces the player. Contact from the side hurts (core rule). */
export const combat = defineSystem<{ stomps: number }>({
  id: 'combat-stomp',
  init: () => ({ stomps: 0 }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    for (const e of ctx.world.entities) {
      if (e.isPlayer || !e.alive || e.contactDamage <= 0 || e.isProjectile) continue;
      if (!overlaps(p, e)) continue;
      const feetAboveCenter = p.y + p.h <= e.y + e.h * 0.6;
      if (p.vy > 0 && feetAboveCenter) {
        ctx.damage(e, 1, p);
        p.vy = -70;
        s.stomps++;
        ctx.world.score += 5;
      }
    }
  },
});
