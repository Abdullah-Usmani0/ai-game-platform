import { movementTopdown, movementTopdownMeta, pickups, pickupsMeta, type GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { boons, meta as boonsMeta } from './systems/boons.js';
import { meleeAttack, meta as meleeMeta } from './systems/melee-attack.js';
import { meta as roomClearMeta, roomClear } from './systems/room-clear.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { BOONS, type Boon } from './systems/boons.js';
export { meleeAttack, roomClear, movementTopdown, pickups, boons };

export const topdownActionRuntime: GenreRuntime = {
  id: 'topdown-action',
  name: 'Top-down action',
  movementMode: 'topdown',
  systems: {
    [movementTopdownMeta.id]: { meta: movementTopdownMeta, create: () => movementTopdown },
    [meleeMeta.id]: { meta: meleeMeta, create: () => meleeAttack },
    [roomClearMeta.id]: { meta: roomClearMeta, create: () => roomClear },
    [pickupsMeta.id]: { meta: pickupsMeta, create: () => pickups },
    [boonsMeta.id]: { meta: boonsMeta, create: () => boons },
  },
  requiredSystems: ['movement-topdown', 'melee-attack', 'room-clear'],
  optionalSystems: ['pickups', 'boons'],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
  paramDefaults: { 'movement-topdown': { dashInvuln: true } },
  feedbackExtras: [
    { event: 'custom:finisher', channels: ['hitstop', 'shake', 'sfx'] },
    { event: 'custom:slam', channels: ['shake', 'sfx'] },
    { event: 'custom:enrage', channels: ['shake', 'flash', 'sfx'] },
  ],
};
