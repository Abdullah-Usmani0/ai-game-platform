import { pickups, pickupsMeta, type GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { combat, meta as combatMeta } from './systems/combat.js';
import { goal, meta as goalMeta } from './systems/goal.js';
import { hazards, meta as hazardsMeta } from './systems/hazards.js';
import { meta as movementMeta, movement } from './systems/movement.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { movement, hazards, combat, pickups, goal };
export { createMovement, ABILITY_DASH, ABILITY_DOUBLE_JUMP, type MovementOptions, type MovementState } from './systems/movement.js';

/** Browser-safe runtime description of the platformer genre. */
export const platformerRuntime: GenreRuntime = {
  id: 'platformer',
  name: 'Precision platformer',
  movementMode: 'platformer',
  systems: {
    [movementMeta.id]: { meta: movementMeta, create: () => movement },
    [hazardsMeta.id]: { meta: hazardsMeta, create: () => hazards },
    [combatMeta.id]: { meta: combatMeta, create: () => combat },
    [pickupsMeta.id]: { meta: pickupsMeta, create: () => pickups },
    [goalMeta.id]: { meta: goalMeta, create: () => goal },
  },
  requiredSystems: ['movement-platformer', 'hazards', 'goal'],
  optionalSystems: ['combat-stomp', 'pickups'],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
};
