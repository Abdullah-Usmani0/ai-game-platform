import { defineSystem } from '@gg/sdk';
import { addGold, carried, carry, cropsOf, entityAt, facedTile, facingStart, track, type Facing } from './farm-kit.js';
import { FARM_TYPES, typeParam } from './rules.js';

interface ShippingState {
  facing: Facing;
  /** What the bin holds, to be paid overnight. */
  pending: number;
  count: number;
  /** Last night's payout, told the next morning. */
  paid: number;
  paidCount: number;
}

/**
 * The shipping bin. Facing it, the action key empties the bag of produce into it; the buyer pays at the sell price
 * overnight, and the next morning a card says what last night's shipping earned.
 */
export const shipping = defineSystem<ShippingState>({
  id: 'shipping',
  init: () => ({ facing: facingStart(), pending: 0, count: 0, paid: 0, paidCount: 0 }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    const pressed = track(s.facing, input, ctx.tick);
    if (!pressed.action) return;
    const { tx, ty } = facedTile(ctx, s.facing);
    const bin = entityAt(ctx, typeParam(ctx, 'binType', FARM_TYPES.bin), tx, ty);
    if (!bin) return;
    let value = 0;
    let count = 0;
    for (const c of cropsOf(ctx)) {
      const n = carried(p, `crop:${c.id}`);
      if (n <= 0) continue;
      value += n * c.sellPrice;
      count += n;
      carry(p, `crop:${c.id}`, -n);
    }
    if (count === 0) {
      ctx.emit('custom:bin_empty', { x: bin.x, y: bin.y });
      return;
    }
    s.pending += value;
    s.count += count;
    ctx.emit('custom:ship', { count, value, x: bin.x, y: bin.y });
  },
  onEvent(s, ev, ctx) {
    if (ev.name === 'custom:day_end') {
      s.paid = s.pending;
      s.paidCount = s.count;
      if (s.pending > 0) {
        addGold(ctx, s.pending);
        ctx.emit('custom:payout', { value: s.pending, count: s.count });
      }
      s.pending = 0;
      s.count = 0;
    } else if (ev.name === 'custom:day_start' && s.paid > 0) {
      ctx.openMenu({
        id: 'shipped',
        title: `Day ${String(ev.payload['day'] ?? '')}`,
        options: [{ id: 'morning', label: 'Good morning', detail: `Shipped ${s.paidCount} for ${s.paid} gold overnight`, icon: 'coin' }],
      });
      s.paid = 0;
    }
  },
});

export const meta = {
  id: 'shipping',
  genres: ['lifesim'],
  summary: 'A shipping bin: facing it, action ships the bag of produce; the buyer pays the sell price overnight.',
  params: { binType: { type: 'string', default: FARM_TYPES.bin, affects: 'none', composed: 'entity' } },
  emits: ['custom:ship', 'custom:bin_empty', 'custom:payout', 'menu_open', 'menu_choose'],
  feedbackFor: ['custom:ship', 'custom:payout', 'custom:bin_empty'],
  controls: { left: 'face', right: 'face', up: 'face', down: 'face', action: 'work' },
  requires: { movement: ['topdown'], roles: ['bin'], systems: ['day-clock'] },
} as const;
