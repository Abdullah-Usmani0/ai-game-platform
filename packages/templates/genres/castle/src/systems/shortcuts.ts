import { defineSystem } from '@gg/sdk';
import { GATE_TYPE } from '../entities.js';

/**
 * Shortcuts: a gate is a grate in a floor (an entity over solid tiles) that opens from below. When the player's head
 * meets its underside, inside its span, its tiles turn to air for good and it is gone: the way it closed off joins a
 * late room to an earlier one, and a rest's save keeps it open.
 */
export const shortcuts = defineSystem<null>({
  id: 'shortcuts',
  init: () => null,
  fixedUpdate(_s, _input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    const type = String(ctx.params['gate'] ?? GATE_TYPE);
    const ts = ctx.map.tileSize;
    for (const g of ctx.world.entities) {
      if (!g.alive || g.type !== type) continue;
      const bottom = g.y + g.h;
      if (p.y < bottom - 2 || p.y > bottom + 2 || p.x + p.w <= g.x || p.x >= g.x + g.w) continue;
      for (let ty = Math.floor(g.y / ts); ty < Math.ceil(bottom / ts); ty++) for (let tx = Math.floor(g.x / ts); tx < Math.ceil((g.x + g.w) / ts); tx++) ctx.map.setKind(tx, ty, 'air');
      g.alive = false;
      ctx.emit('custom:door_open', { entity: g.id, x: Math.floor((g.x + g.w / 2) / ts) });
      ctx.emit('despawn', { entity: g.id, type: g.type });
    }
  },
});

export const meta = {
  id: 'shortcuts',
  genres: ['castle'],
  required: true,
  summary: "Shortcuts: a gate in a floor opens when the player's head meets it from below, for good, joining a late room to an earlier one.",
  params: { gate: { type: 'string', default: GATE_TYPE, affects: 'levels', composed: 'entity' } },
  emits: ['custom:door_open', 'despawn'],
  feedbackFor: ['custom:door_open'],
  controls: {},
  hud: [],
} as const;
