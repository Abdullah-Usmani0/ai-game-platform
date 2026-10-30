import { courier } from './courier.js';
import { checkStations, dressStations, type StationsCtx } from './level/stations.js';
import type { BlockLevelCtx, BlockModule } from './manifest.js';
import { carry, meta as carryMeta } from './systems/carry.js';
import { orders, meta as ordersMeta } from './systems/orders.js';
import { vehicle, meta as vehicleMeta } from './systems/vehicle.js';

/** The courier's stations as a game names and sizes them, with as many dropoffs as it asks for. */
function stationsCtx(ctx: BlockLevelCtx): StationsCtx {
  const source = ctx.typeOf('source');
  const dropoff = ctx.typeOf('dropoff');
  const size = (type: string, w: number, h: number) => ({ w: ctx.defOf(type)?.w ?? w, h: ctx.defOf(type)?.h ?? h });
  return {
    movementMode: ctx.movementMode,
    feel: ctx.feel,
    types: { source, dropoff },
    sizes: { source: size(source, 8, 8), dropoff: size(dropoff, 16, 16) },
    dropoffs: Math.max(1, Math.min(6, Math.round(Number(ctx.params['dropoffs'] ?? 3)))),
  };
}

/**
 * Carry and deliver, as a block: the system, its three entities (what is carried, where it is made, where it goes:
 * movement-neutral, so a side-view lighthouse and a top-down tea room both have them), the feedback its events need,
 * the courier that plays the job, and the stations it places on every level.
 */
export const carryBlock: BlockModule = {
  meta: carryMeta,
  create: () => carry,
  archetypes: [
    // Falls in a side view when dropped; lies where it is put down top-down.
    { def: { type: 'cargo', w: 6, h: 6 }, roles: ['cargo'] },
    { def: { type: 'source', w: 8, h: 8, gravity: false }, roles: ['source'] },
    { def: { type: 'dropoff', w: 16, h: 16, gravity: false }, roles: ['dropoff'] },
  ],
  feedbackExtras: [
    { event: 'custom:lift', channels: ['particle', 'sfx'] },
    { event: 'custom:deliver', channels: ['particle', 'sfx'] },
    { event: 'custom:drop', channels: ['sfx'] },
    // A job that cannot be done says so: nothing asked for here, nothing made yet.
    { event: 'custom:no_order', channels: ['sfx'] },
    { event: 'custom:not_ready', channels: ['sfx'] },
  ],
  bot: courier,
  dress: (level, seed, ctx) => dressStations(level, seed, stationsCtx(ctx)),
  checkLevel: (level, ctx) => checkStations(level, stationsCtx(ctx)),
};

/**
 * Timed orders, as a block on top of carry: the dropoffs ask in turn and wait, and a walkout costs a heart. It brings
 * no entities of its own (it orders at carry's dropoffs) and no bot (the courier already serves the most urgent order
 * first), only the feedback its events need.
 */
export const ordersBlock: BlockModule = {
  meta: ordersMeta,
  create: () => orders,
  feedbackExtras: [
    { event: 'custom:order', channels: ['particle', 'sfx'] },
    { event: 'custom:order_hurry', channels: ['sfx'] },
    { event: 'custom:order_filled', channels: ['particle', 'sfx'] },
    // The heart it costs shakes the screen as any blow does; the walkout itself puffs and sighs.
    { event: 'custom:order_missed', channels: ['particle', 'sfx'] },
  ],
};

/**
 * A vehicle, as a block: the movement a game drives instead of walking, and the feedback a hard hit on a wall needs
 * (a boost is the dash every game already answers).
 */
export const vehicleBlock: BlockModule = {
  meta: vehicleMeta,
  create: () => vehicle,
  feedbackExtras: [{ event: 'custom:bump', channels: ['shake', 'sfx'] }],
};
