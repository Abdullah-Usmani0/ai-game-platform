import { movementTopdown, movementTopdownMeta, pickups, pickupsMeta, spawner, spawnerMeta, survival, survivalMeta, type GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { meta as shooterMeta, playerShooter } from './systems/player-shooter.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { playerShooter, movementTopdown, spawner, survival, pickups };

export const shmupRuntime: GenreRuntime = {
  id: 'shmup',
  name: 'Vertical shooter',
  movementMode: 'topdown',
  systems: {
    [movementTopdownMeta.id]: { meta: movementTopdownMeta, create: () => movementTopdown },
    [shooterMeta.id]: { meta: shooterMeta, create: () => playerShooter },
    [spawnerMeta.id]: { meta: spawnerMeta, create: () => spawner },
    [survivalMeta.id]: { meta: survivalMeta, create: () => survival },
    [pickupsMeta.id]: { meta: pickupsMeta, create: () => pickups },
  },
  requiredSystems: ['movement-topdown', 'player-shooter', 'spawner', 'survival'],
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
