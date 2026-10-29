import type { GenreRuntime } from '@gg/template-core';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, CRATE_TYPE, ENTITY_DEFS, PLAYER, TARGET_TYPE } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { gridPush, meta as gridPushMeta } from './systems/grid-push.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export * from './puzzle.js';
export { gridPush };

export const puzzleRuntime: GenreRuntime = {
  id: 'puzzle',
  name: 'Puzzle (Sokoban)',
  movementMode: 'topdown',
  systems: {
    [gridPushMeta.id]: { meta: gridPushMeta, create: () => gridPush },
  },
  requiredSystems: ['grid-push'],
  optionalSystems: [],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
  entityRoles: { [CRATE_TYPE]: ['crate'], [TARGET_TYPE]: ['target'] },
};
