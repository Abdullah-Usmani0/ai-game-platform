import { defineSystem } from '@gg/sdk';

/** Example: pickups within `magnetPx` drift toward the player at `speed`; the core pickups system collects them. */
export const homingPickup = defineSystem<{ pulled: number }>({
  id: 'homing-pickup',
  init: () => ({ pulled: 0 }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    const magnet = Number(ctx.params['magnetPx'] ?? 32);
    const speed = Number(ctx.params['speed'] ?? 120);
    for (const e of ctx.world.entities) {
      if (!e.pickup || !e.alive) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > magnet || d === 0) continue;
      ctx.move(e, (dx / d) * speed * ctx.dt, (dy / d) * speed * ctx.dt);
      s.pulled++;
    }
  },
});
