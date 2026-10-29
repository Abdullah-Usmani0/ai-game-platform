import type { ParamValue } from '@gg/schemas';
import { defineSystem, overlaps, type Entity } from '@gg/sdk';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP, BOOTS_TYPE, DOOR_TYPE, KEY_TYPE, WINGS_TYPE } from '../entities.js';

interface RelicsState {
  /** Relics, keys and doors on the level as it loaded: what there is to find and open. */
  total: number;
  /** Relics and keys taken plus doors opened so far. */
  done: number;
  keys: number;
  /** A relic was picked up; the checkpoint moves to the next spot the player stands on. */
  checkpointPending: boolean;
  found: string[];
}

/** Within a pixel of the door on either side, overlapping its rows. */
function touching(p: Entity, door: Entity): boolean {
  return p.x < door.x + door.w + 1 && p.x + p.w > door.x - 1 && p.y < door.y + door.h && p.y + p.h > door.y;
}

/** The relic types and the ability each grants, the key and the door, as this game names them (by default the genre's). */
function typesOf(params: Readonly<Record<string, ParamValue>>): { ability: Record<string, string>; key: string; door: string } {
  return {
    ability: { [String(params['doubleJumpRelic'] ?? WINGS_TYPE)]: ABILITY_DOUBLE_JUMP, [String(params['dashRelic'] ?? BOOTS_TYPE)]: ABILITY_DASH },
    key: String(params['keyType'] ?? KEY_TYPE),
    door: String(params['doorType'] ?? DOOR_TYPE),
  };
}

/**
 * Ability relics set the player's ability flags (wings: double-jump, boots: dash), keys open locked doors on contact.
 * A door's tiles are solid until it opens; opening turns them to air at runtime. Abilities survive respawns.
 */
export const relics = defineSystem<RelicsState>({
  id: 'relics',
  init: (ctx) => {
    const t = typesOf(ctx.params);
    return { total: ctx.world.entities.filter((e) => t.ability[e.type] !== undefined || e.type === t.key || e.type === t.door).length, done: 0, keys: 0, checkpointPending: false, found: [] };
  },
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    const t = typesOf(ctx.params);
    if (p.alive) {
      for (const e of ctx.world.entities) {
        if (!e.alive || e.isPlayer) continue;
        const ability = t.ability[e.type];
        if ((ability !== undefined || e.type === t.key) && overlaps(p, e)) {
          e.alive = false;
          if (ability !== undefined) {
            p.flags[ability] = true;
            s.found.push(e.type);
          } else s.keys++;
          ctx.world.score += Number(ctx.params['relicScore'] ?? 25);
          s.done++;
          s.checkpointPending = true;
          ctx.emit('pickup', { entity: e.id, type: e.type });
          ctx.emit('despawn', { entity: e.id, type: e.type });
        } else if (e.type === t.door && s.keys > 0 && touching(p, e)) {
          s.keys--;
          const ts = ctx.map.tileSize;
          const tx = Math.floor((e.x + e.w / 2) / ts);
          for (let ty = Math.floor(e.y / ts + 1e-6); ty <= Math.floor((e.y + e.h - 1e-6) / ts); ty++) ctx.map.setKind(tx, ty, 'air');
          e.alive = false;
          s.done++;
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
  progress: (s) => (s.total > 0 ? s.done / s.total : 1),
});

export const meta = {
  id: 'relics',
  genres: ['metroidvania'],
  required: true,
  summary: 'Relics grant abilities (wings: one air jump, boots: the dash) or keys; touching a locked door with a key opens it. A pickup moves the checkpoint to where the player next stands.',
  params: {
    relicScore: { type: 'number', min: 0, max: 100, default: 25, affects: 'none' },
    doubleJumpRelic: { type: 'string', default: WINGS_TYPE, affects: 'none', entity: true },
    dashRelic: { type: 'string', default: BOOTS_TYPE, affects: 'none', entity: true },
    keyType: { type: 'string', default: KEY_TYPE, affects: 'none', entity: true },
    doorType: { type: 'string', default: DOOR_TYPE, affects: 'none', entity: true },
  },
  emits: ['pickup', 'despawn', 'checkpoint', 'custom:door_open'],
  feedbackFor: ['pickup', 'checkpoint'],
  requires: { movement: ['platformer'], roles: ['relic'] },
} as const;
