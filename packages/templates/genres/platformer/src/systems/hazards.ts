import { defineSystem } from '@gg/sdk';

interface HazardState {
  respawnAt: number;
}

/** Hazard tiles and the bottom of the map kill; the player respawns at the checkpoint after a beat. */
export const hazards = defineSystem<HazardState>({
  id: 'hazards',
  init: () => ({ respawnAt: -1 }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) {
      if (s.respawnAt >= 0 && ctx.tick >= s.respawnAt) {
        s.respawnAt = -1;
        ctx.respawnPlayer();
      }
      return;
    }
    if (ctx.map.isHazard(p.x, p.y, p.w, p.h) || p.y > ctx.map.pixelHeight + 16) {
      ctx.damage(p, 99, null);
    }
  },
  onEvent(s, ev, ctx) {
    if (ev.name === 'death' && ev.payload['type'] === 'player') s.respawnAt = ctx.tick + Number(ctx.params['respawnDelayTicks'] ?? 30);
  },
});

export const meta = {
  id: 'hazards',
  genres: ['platformer', 'metroidvania'],
  required: true,
  summary: 'Hazard tiles and falling off the map kill; the player respawns at the checkpoint after a short delay.',
  params: { respawnDelayTicks: { type: 'number', min: 0, max: 120, default: 30, affects: 'none' } },
  emits: ['death', 'spawn'],
  feedbackFor: ['death'],
} as const;
