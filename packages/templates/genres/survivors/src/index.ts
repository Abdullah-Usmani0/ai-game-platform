import { movementTopdown, movementTopdownMeta, pickups, pickupsMeta, spawner, spawnerMeta, survival, survivalMeta, type GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { autoAttack, meta as autoAttackMeta } from './systems/auto-attack.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { movementTopdown, autoAttack, spawner, survival, pickups };

export const survivorsRuntime: GenreRuntime = {
  id: 'survivors',
  name: 'Survivors arena',
  movementMode: 'topdown',
  systems: {
    [movementTopdownMeta.id]: { meta: movementTopdownMeta, create: () => movementTopdown },
    [autoAttackMeta.id]: { meta: autoAttackMeta, create: () => autoAttack },
    [spawnerMeta.id]: { meta: spawnerMeta, create: () => spawner },
    [survivalMeta.id]: { meta: survivalMeta, create: () => survival },
    [pickupsMeta.id]: { meta: pickupsMeta, create: () => pickups },
  },
  requiredSystems: ['movement-topdown', 'auto-attack', 'spawner', 'survival'],
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
