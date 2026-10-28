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
    if (ev.name === 'death' && ev.payload['type'] === 'player') s.respawnAt = ctx.tick + 30;
  },
});
