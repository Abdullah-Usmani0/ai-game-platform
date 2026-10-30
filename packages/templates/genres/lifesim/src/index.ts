import { movementTopdown, movementTopdownMeta, type GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, ENTITY_DEFS, ENTITY_ROLES, PLAYER } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { dayClock, meta as dayClockMeta } from './systems/day-clock.js';
import { energy, meta as energyMeta } from './systems/energy.js';
import { farming, meta as farmingMeta } from './systems/farming.js';
import { meta as seasonMeta, season } from './systems/season.js';
import { meta as shippingMeta, shipping } from './systems/shipping.js';
import { meta as shopMeta, shop } from './systems/shop.js';
import { meta as sleepMeta, sleep } from './systems/sleep.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { clockFace } from './systems/day-clock.js';
export { stageOf } from './systems/farming.js';
export { quotaOf } from './systems/season.js';
export { idealSeason, packToBuy, plotSeason, seasonQuota, seedToSow, seedValue } from './systems/economy.js';
export { FARM_DEFAULTS, FARM_TYPES, farmRules, farmRulesOf, type FarmRules } from './systems/rules.js';
export { cropsOf, DEFAULT_CROPS, DAY_END_MIN, DAY_START_MIN } from './systems/farm-kit.js';
export { dayClock, energy, farming, movementTopdown, season, shipping, shop, sleep };

/**
 * A cosy farm: walk the yard, till, sow, water and harvest, ship produce for gold overnight, buy seeds at the stall,
 * sleep to end the day, and make the season's quota before its last day.
 */
export const lifesimRuntime: GenreRuntime = {
  id: 'lifesim',
  name: 'Cozy farm',
  movementMode: 'topdown',
  systems: {
    [movementTopdownMeta.id]: { meta: movementTopdownMeta, create: () => movementTopdown },
    [dayClockMeta.id]: { meta: dayClockMeta, create: () => dayClock },
    [farmingMeta.id]: { meta: farmingMeta, create: () => farming },
    [shippingMeta.id]: { meta: shippingMeta, create: () => shipping },
    [seasonMeta.id]: { meta: seasonMeta, create: () => season },
    [shopMeta.id]: { meta: shopMeta, create: () => shop },
    [sleepMeta.id]: { meta: sleepMeta, create: () => sleep },
    [energyMeta.id]: { meta: energyMeta, create: () => energy },
  },
  requiredSystems: ['movement-topdown', 'day-clock', 'farming', 'shipping', 'season'],
  optionalSystems: ['shop', 'sleep', 'energy'],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
  entityRoles: ENTITY_ROLES,
  // A cosy walk: no dash unless a game asks for one, and corners that let the farmer slip around them.
  paramDefaults: { 'movement-topdown': { dash: false, cornerSlip: 3 } },
  feedbackExtras: [
    { event: 'custom:till', channels: ['particle', 'sfx'] },
    { event: 'custom:plant', channels: ['particle', 'sfx'] },
    { event: 'custom:water', channels: ['particle', 'sfx'] },
    { event: 'custom:harvest', channels: ['particle', 'sfx'] },
    { event: 'custom:ship', channels: ['particle', 'sfx'] },
    { event: 'custom:payout', channels: ['sfx'] },
    { event: 'custom:buy', channels: ['sfx'] },
    { event: 'custom:sleep', channels: ['sfx'] },
    { event: 'custom:day_start', channels: ['sfx'] },
    { event: 'custom:dusk', channels: ['sfx'] },
    { event: 'custom:exhausted', channels: ['sfx'] },
    { event: 'custom:season_over', channels: ['sfx'] },
    // A job that cannot be done says so: no seeds in hand, too tired, nothing to ship.
    { event: 'custom:no_seeds', channels: ['sfx'] },
    { event: 'custom:too_tired', channels: ['sfx'] },
    { event: 'custom:bin_empty', channels: ['sfx'] },
  ],
};
