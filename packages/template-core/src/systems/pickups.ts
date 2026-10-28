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
      ctx.world.score += Number(ctx.params['value'] ?? 1);
      ctx.emit('pickup', { entity: e.id, type: e.type });
      ctx.emit('despawn', { entity: e.id, type: e.type });
    }
    ctx.world.hud['coins'] = s.collected;
  },
});

export const meta = {
  id: 'pickups',
  genres: '*',
  summary: 'Collectible entities overlapping the player are consumed for score and a pickup event.',
  params: { value: { type: 'number', min: 1, max: 100, default: 1, affects: 'none' } },
  emits: ['pickup', 'despawn'],
  feedbackFor: ['pickup'],
} as const;
