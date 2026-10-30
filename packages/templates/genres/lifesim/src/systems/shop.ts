import { defineSystem, type MenuOption } from '@gg/sdk';
import { addGold, carry, cropsOf, entityAt, facedTile, facingStart, goldOf, SHELF, track, type Facing } from './farm-kit.js';
import { FARM_DEFAULTS, FARM_TYPES, typeParam } from './rules.js';

/**
 * The seed shop. Facing the stall, the action key opens it: a card per crop (the first four of the game's crops) with
 * the price of a pack of seeds, dimmed when the purse is short. Picking one buys the pack; dash leaves.
 */
export const shop = defineSystem<{ facing: Facing }>({
  id: 'shop',
  init: () => ({ facing: facingStart() }),
  fixedUpdate(s, input, ctx) {
    if (!ctx.world.player.alive) return;
    const pressed = track(s.facing, input, ctx.tick);
    if (!pressed.action) return;
    const { tx, ty } = facedTile(ctx, s.facing);
    if (!entityAt(ctx, typeParam(ctx, 'shopType', FARM_TYPES.shop), tx, ty)) return;
    const pack = Math.max(1, Math.round(Number(ctx.params['packSize'] ?? FARM_DEFAULTS.packSize)));
    const gold = goldOf(ctx);
    const options: MenuOption[] = cropsOf(ctx)
      .slice(0, SHELF)
      .map((c) => ({
        id: c.id,
        label: c.name,
        // Short enough for a card: how long it grows, how often it bears again, what a harvest fetches.
        detail: `${c.growDays} days${c.regrowDays ? `, then every ${c.regrowDays}` : ''}. Sells for ${c.sellPrice}`,
        icon: 'seed',
        cost: c.seedPrice * pack,
        disabled: gold < c.seedPrice * pack,
      }));
    ctx.openMenu({ id: 'shop', title: `Seeds, ${pack} a pack`, options, cancellable: true });
  },
  onEvent(_s, ev, ctx) {
    if (ev.name !== 'menu_choose' || ev.payload['menu'] !== 'shop') return;
    const crop = cropsOf(ctx).find((c) => c.id === ev.payload['option']);
    if (!crop) return;
    const pack = Math.max(1, Math.round(Number(ctx.params['packSize'] ?? FARM_DEFAULTS.packSize)));
    const cost = crop.seedPrice * pack;
    // The card was greyed out when the purse was short; the purse is checked again all the same.
    if (goldOf(ctx) < cost) return;
    addGold(ctx, -cost);
    carry(ctx.world.player, `seed:${crop.id}`, pack);
    ctx.emit('custom:buy', { crop: crop.id, count: pack, cost });
  },
});

export const meta = {
  id: 'shop',
  genres: ['lifesim'],
  summary: 'A seed shop stall: facing it, action opens a menu of seed packs priced from the crop table; dash leaves.',
  params: {
    packSize: { type: 'number', min: 1, max: 10, default: FARM_DEFAULTS.packSize, affects: 'levels' },
    shopType: { type: 'string', default: FARM_TYPES.shop, affects: 'none', composed: 'entity' },
  },
  emits: ['menu_open', 'menu_choose', 'custom:buy'],
  feedbackFor: ['menu_open', 'menu_choose', 'custom:buy'],
  controls: { left: 'face', right: 'face', up: 'face', down: 'face', action: 'work' },
  requires: { movement: ['topdown'], roles: ['shop'] },
} as const;
