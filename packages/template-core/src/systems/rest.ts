import type { TileKind } from '@gg/schemas';
import { centerX, centerY, defineSystem, staysGone, Tilemap, type ProgressSave, type SimCtx } from '@gg/sdk';

/**
 * What a rest saves: where the player stands and which way they face, their props (abilities, flags, the map), the
 * entities the level placed that are gone for good (picked up, opened, a boss beaten), and every tile changed since the
 * level began (a door opened).
 */
export function progressSaveOf(ctx: SimCtx): ProgressSave {
  const p = ctx.world.player;
  // Those the sim already dropped, and any that died this step and are still in the list.
  const dying = ctx.world.entities.filter((e) => e.levelIndex !== undefined && !e.alive && !e.isPlayer && staysGone(e)).map((e) => e.levelIndex!);
  const removed = [...new Set([...(ctx.world.gone ?? []), ...dying])].sort((a, b) => a - b);
  const authored = new Tilemap(ctx.map.level);
  const tiles: Array<[number, number, TileKind]> = [];
  for (let ty = 0; ty < ctx.map.height; ty++) for (let tx = 0; tx < ctx.map.width; tx++) if (ctx.map.kindAt(tx, ty) !== authored.kindAt(tx, ty)) tiles.push([tx, ty, ctx.map.kindAt(tx, ty)]);
  return { at: { x: p.x, y: p.y }, facing: p.facing < 0 ? -1 : 1, props: { ...p.props }, removed, tiles };
}

interface RestState {
  /** Up on the step before: a rest takes a fresh press, and a key held as the region loads is not one. */
  prev: boolean;
  /** The tick a fallen player's region loads again, or -1. */
  reloadAt: number;
}

/**
 * Save altars: pressing up beside one rests. Health refills, the checkpoint moves to the altar, the rest is announced
 * with the save it makes (custom:rest), and the region loads again from that save: its enemies back, what the player
 * found and opened kept, the player at the altar. A fall does the same from the last rest (the region's start before
 * any), keeping everything found since: the player wakes at the altar, the enemies are back.
 */
export const rest = defineSystem<RestState>({
  id: 'rest',
  init: () => ({ prev: true, reloadAt: -1 }),
  fixedUpdate(s, input, ctx) {
    const press = input.up && !s.prev;
    s.prev = input.up;
    const p = ctx.world.player;
    if (!p.alive) {
      if (s.reloadAt < 0) s.reloadAt = ctx.tick + Number(ctx.params['reloadDelayTicks'] ?? 60);
      else if (ctx.tick >= s.reloadAt) ctx.reloadFrom({ ...progressSaveOf(ctx), at: { ...ctx.world.checkpoint } });
      return;
    }
    s.reloadAt = -1;
    if (!press) return;
    const altarType = String(ctx.params['altar'] ?? 'altar');
    const reach = Number(ctx.params['reach'] ?? 8);
    const altar = ctx.world.entities.find((e) => e.alive && e.type === altarType && Math.abs(centerX(e) - centerX(p)) <= e.w / 2 + reach && Math.abs(centerY(e) - centerY(p)) <= e.h / 2 + reach);
    if (!altar) return;
    p.hp = p.maxHp;
    ctx.world.checkpoint = { x: p.x, y: p.y };
    const save = progressSaveOf(ctx);
    ctx.emit('custom:rest', { altar: altar.id, save });
    ctx.reloadFrom(save);
  },
});

export const meta = {
  id: 'rest',
  genres: ['castle'],
  summary:
    'Save altars: pressing up beside one refills health, saves and loads the region again from the save, its enemies back, what the player found and opened kept. A fall returns the player to their last rest the same way, keeping what they found since.',
  params: {
    altar: { type: 'string', default: 'altar', affects: 'levels' },
    reach: { type: 'number', min: 2, max: 32, default: 8, affects: 'none' },
    reloadDelayTicks: { type: 'number', min: 0, max: 180, default: 60, affects: 'none' },
  },
  emits: ['custom:rest'],
  feedbackFor: ['custom:rest'],
  controls: { up: 'rest at an altar' },
  provides: { death: 'reload' },
  requires: { roles: ['altar'] },
  hud: [],
} as const;
