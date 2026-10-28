import { movementTopdown, movementTopdownMeta, pickups, pickupsMeta, type GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { meleeAttack, meta as meleeMeta } from './systems/melee-attack.js';
import { meta as roomClearMeta, roomClear } from './systems/room-clear.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { meleeAttack, roomClear, movementTopdown, pickups };

export const topdownActionRuntime: GenreRuntime = {
  id: 'topdown-action',
  name: 'Top-down action',
  movementMode: 'topdown',
  systems: {
    [movementTopdownMeta.id]: { meta: movementTopdownMeta as never, create: () => movementTopdown },
    [meleeMeta.id]: { meta: meleeMeta as never, create: () => meleeAttack },
    [roomClearMeta.id]: { meta: roomClearMeta as never, create: () => roomClear },
    [pickupsMeta.id]: { meta: pickupsMeta as never, create: () => pickups },
  },
  requiredSystems: ['movement-topdown', 'melee-attack', 'room-clear'],
  optionalSystems: ['pickups'],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
};
