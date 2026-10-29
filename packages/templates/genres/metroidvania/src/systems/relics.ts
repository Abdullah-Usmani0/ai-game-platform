import { defineSystem, overlaps, type Entity } from '@gg/sdk';
import { DOOR_TYPE, KEY_TYPE, RELIC_ABILITY } from '../entities.js';

interface RelicsState {
  keys: number;
  /** A relic was picked up; the checkpoint moves to the next spot the player stands on. */
  checkpointPending: boolean;
  found: string[];
}

/** Within a pixel of the door on either side, overlapping its rows. */
function touching(p: Entity, door: Entity): boolean {
  return p.x < door.x + door.w + 1 && p.x + p.w > door.x - 1 && p.y < door.y + door.h && p.y + p.h > door.y;
}

/**
 * Ability relics set the player's ability flags (wings: double-jump, boots: dash), keys open locked doors on contact.
 * A door's tiles are solid until it opens; opening turns them to air at runtime. Abilities survive respawns.
 */
export const relics = defineSystem<RelicsState>({
  id: 'relics',
  init: () => ({ keys: 0, checkpointPending: false, found: [] }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (p.alive) {
      for (const e of ctx.world.entities) {
        if (!e.alive || e.isPlayer) continue;
        const ability = RELIC_ABILITY[e.type];
        if ((ability !== undefined || e.type === KEY_TYPE) && overlaps(p, e)) {
          e.alive = false;
          if (ability !== undefined) {
            p.flags[ability] = true;
            s.found.push(e.type);
          } else s.keys++;
          ctx.world.score += Number(ctx.params['relicScore'] ?? 25);
          s.checkpointPending = true;
          ctx.emit('pickup', { entity: e.id, type: e.type });
          ctx.emit('despawn', { entity: e.id, type: e.type });
        } else if (e.type === DOOR_TYPE && s.keys > 0 && touching(p, e)) {
          s.keys--;
          const ts = ctx.map.tileSize;
          const tx = Math.floor((e.x + e.w / 2) / ts);
          for (let ty = Math.floor(e.y / ts + 1e-6); ty <= Math.floor((e.y + e.h - 1e-6) / ts); ty++) ctx.map.setKind(tx, ty, 'air');
          e.alive = false;
          ctx.emit('custom:door_open', { entity: e.id, x: tx });
          ctx.emit('despawn', { entity: e.id, type: e.type });
        }
      }
      if (s.checkpointPending && p.grounded) {
        s.checkpointPending = false;
        ctx.world.checkpoint = { x: p.x, y: p.y };
        ctx.emit('checkpoint', { x: p.x, y: p.y });
      }
    }
    ctx.world.hud['keys'] = s.keys;
    ctx.world.hud['relics'] = s.found.length > 0 ? s.found.join('+') : '-';
  },
});

export const meta = {
  id: 'relics',
  genres: ['metroidvania'],
  required: true,
  summary: 'Relics grant abilities (wings: one air jump, boots: the dash) or keys; touching a locked door with a key opens it. A pickup moves the checkpoint to where the player next stands.',
  params: { relicScore: { type: 'number', min: 0, max: 100, default: 25, affects: 'none' } },
  emits: ['pickup', 'despawn', 'checkpoint'],
  feedbackFor: ['pickup', 'checkpoint'],
} as const;
