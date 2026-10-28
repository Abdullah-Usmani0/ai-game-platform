import { pickups, pickupsMeta, type GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { autoAttack, meta as autoAttackMeta } from './systems/auto-attack.js';
import { meta as movementMeta, movementTopdown } from './systems/movement-topdown.js';
import { meta as spawnerMeta, spawner } from './systems/spawner.js';
import { meta as survivalMeta, survival } from './systems/survival.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { movementTopdown, autoAttack, spawner, survival, pickups };

export const survivorsRuntime: GenreRuntime = {
  id: 'survivors',
  name: 'Survivors arena',
  movementMode: 'topdown',
  systems: {
    [movementMeta.id]: { meta: movementMeta as never, create: () => movementTopdown },
    [autoAttackMeta.id]: { meta: autoAttackMeta as never, create: () => autoAttack },
    [spawnerMeta.id]: { meta: spawnerMeta as never, create: () => spawner },
    [survivalMeta.id]: { meta: survivalMeta as never, create: () => survival },
    [pickupsMeta.id]: { meta: pickupsMeta as never, create: () => pickups },
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
