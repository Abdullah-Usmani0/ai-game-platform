import type { TileKind } from '@gg/schemas';
import { centerX, centerY, defineSystem, staysGone, Tilemap, type ProgressSave, type SimCtx } from '@gg/sdk';

/**
 * What a rest saves: where the player stands, their props (abilities, flags, the map), the entities the level placed
 * that are gone for good (picked up, opened, a boss beaten), and every tile changed since the level began (a door opened).
 */
export function progressSaveOf(ctx: SimCtx): ProgressSave {
  const p = ctx.world.player;
  // Those the sim already dropped, and any that died this step and are still in the list.
  const dying = ctx.world.entities.filter((e) => e.levelIndex !== undefined && !e.alive && !e.isPlayer && staysGone(e)).map((e) => e.levelIndex!);
  const removed = [...new Set([...(ctx.world.gone ?? []), ...dying])].sort((a, b) => a - b);
  const authored = new Tilemap(ctx.map.level);
  const tiles: Array<[number, number, TileKind]> = [];
  for (let ty = 0; ty < ctx.map.height; ty++) for (let tx = 0; tx < ctx.map.width; tx++) if (ctx.map.kindAt(tx, ty) !== authored.kindAt(tx, ty)) tiles.push([tx, ty, ctx.map.kindAt(tx, ty)]);
  return { at: { x: p.x, y: p.y }, props: { ...p.props }, removed, tiles };
}

interface RestState {
  prev: boolean;
}

/**
 * Save altars: pressing up beside one rests. Health refills, the checkpoint moves to the altar, and the rest is
 * announced with the save it makes (custom:rest), from which the region loads again: its enemies back, what the player
 * found and opened kept.
 */
export const rest = defineSystem<RestState>({
  id: 'rest',
  init: () => ({ prev: false }),
  fixedUpdate(s, input, ctx) {
    const press = input.up && !s.prev;
    s.prev = input.up;
    const p = ctx.world.player;
    if (!press || !p.alive) return;
    const altarType = String(ctx.params['altar'] ?? 'altar');
    const reach = Number(ctx.params['reach'] ?? 8);
    const altar = ctx.world.entities.find((e) => e.alive && e.type === altarType && Math.abs(centerX(e) - centerX(p)) <= e.w / 2 + reach && Math.abs(centerY(e) - centerY(p)) <= e.h / 2 + reach);
    if (!altar) return;
    p.hp = p.maxHp;
    ctx.world.checkpoint = { x: p.x, y: p.y };
    ctx.emit('custom:rest', { altar: altar.id, save: progressSaveOf(ctx) });
  },
});

export const meta = {
  id: 'rest',
  genres: ['castle'],
  summary: 'Save altars: pressing up beside one refills health, moves the checkpoint there and saves; the region loads again from the save, its enemies back, what the player found and opened kept.',
  params: {
    altar: { type: 'string', default: 'altar', affects: 'levels' },
    reach: { type: 'number', min: 2, max: 32, default: 8, affects: 'none' },
  },
  emits: ['custom:rest'],
  feedbackFor: ['custom:rest'],
  controls: { up: 'rest at an altar' },
  requires: { roles: ['altar'] },
  hud: [],
} as const;
