import { defineSystem, overlaps } from '@gg/sdk';

export const pickups = defineSystem<{ collected: number }>({
  id: 'pickups',
  init: () => ({ collected: 0 }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    for (const e of ctx.world.entities) {
      if (!e.pickup || !e.alive || !overlaps(p, e)) continue;
      e.alive = false;
      s.collected++;
      ctx.world.score += 1;
      ctx.emit('pickup', { entity: e.id, type: e.type });
      ctx.emit('despawn', { entity: e.id, type: e.type });
    }
    ctx.world.hud['coins'] = s.collected;
  },
});
