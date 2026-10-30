import { courier } from './courier.js';
import { checkStations, dressStations, type StationsCtx } from './level/stations.js';
import type { BlockLevelCtx, BlockModule } from './manifest.js';
import { carry, meta as carryMeta } from './systems/carry.js';

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
