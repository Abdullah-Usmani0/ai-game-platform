import { pickups, pickupsMeta, type GenreRuntime } from '@gg/template-core';
import { platformerRuntime } from '@gg/template-platformer';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { COLLECTIBLE_TYPES, DOOR_TYPE, ENTITY_DEFS, KEY_TYPE, PLAYER, RELIC_ABILITY } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { meta as movementMeta, movement } from './movement.js';
import { meta as relicsMeta, relics } from './systems/relics.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { movement, relics, pickups };

const shared = platformerRuntime.systems;

/** Browser-safe runtime description of the metroidvania genre: the platformer's hazards, goal and stomp, plus relics and gated movement. */
export const metroidvaniaRuntime: GenreRuntime = {
  id: 'metroidvania',
  name: 'Metroidvania explorer',
  movementMode: 'platformer',
  systems: {
    [movementMeta.id]: { meta: movementMeta as never, create: () => movement },
    [relicsMeta.id]: { meta: relicsMeta as never, create: () => relics },
    hazards: shared['hazards']!,
    goal: shared['goal']!,
    'combat-stomp': shared['combat-stomp']!,
    [pickupsMeta.id]: { meta: pickupsMeta as never, create: () => pickups },
  },
  requiredSystems: ['movement-metroidvania', 'relics', 'hazards', 'goal'],
  optionalSystems: ['combat-stomp', 'pickups'],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
  feedbackExtras: [{ event: 'custom:door_open', channels: ['sfx', 'shake'] }],
  entityRoles: { ...Object.fromEntries(Object.keys(RELIC_ABILITY).map((t) => [t, ['relic' as const]])), [KEY_TYPE]: ['key'], [DOOR_TYPE]: ['door'] },
};
