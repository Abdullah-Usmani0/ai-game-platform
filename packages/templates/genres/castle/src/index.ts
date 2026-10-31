import { pickups, pickupsMeta, rest, restMeta, rooms, roomsMeta, type GenreRuntime, type SystemModule } from '@gg/template-core';
import { metroidvaniaRuntime } from '@gg/template-metroidvania';
import { platformerRuntime } from '@gg/template-platformer';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { ALTAR_TYPE, COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER, RELIC_ABILITY } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { meta as movementMeta, movement } from './movement.js';
import { abilities, meta as abilitiesMeta } from './systems/abilities.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export { movement, abilities };

/** A shared system as the castle offers it: the same code, listed for the castle. */
const forCastle = (mod: SystemModule | undefined): SystemModule => ({ meta: { ...mod!.meta, genres: ['castle'] }, create: mod!.create });

/**
 * Browser-safe runtime description of the castle genre, the tier of large heroes on 16 px tiles: a region of rooms
 * with save altars, the metroidvania's relics, and the platformer's hazards, goal and stomp.
 */
export const castleRuntime: GenreRuntime = {
  id: 'castle',
  name: 'Castle explorer',
  movementMode: 'platformer',
  tier: 'castle',
  systems: {
    [movementMeta.id]: { meta: movementMeta, create: () => movement },
    relics: forCastle(metroidvaniaRuntime.systems['relics']),
    [abilitiesMeta.id]: { meta: abilitiesMeta, create: () => abilities },
    [roomsMeta.id]: { meta: roomsMeta, create: () => rooms },
    [restMeta.id]: { meta: restMeta, create: () => rest },
    hazards: forCastle(platformerRuntime.systems['hazards']),
    goal: forCastle(platformerRuntime.systems['goal']),
    'combat-stomp': forCastle(platformerRuntime.systems['combat-stomp']),
    [pickupsMeta.id]: forCastle({ meta: pickupsMeta, create: () => pickups }),
  },
  requiredSystems: ['movement-castle', 'relics', 'abilities', 'rooms', 'rest', 'hazards', 'goal'],
  optionalSystems: ['combat-stomp', 'pickups'],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
  feedbackExtras: [{ event: 'custom:rest', channels: ['sfx', 'flash'] }],
  // The platformer's stomp bounce at the castle's scale.
  paramDefaults: { 'combat-stomp': { bounceVy: -140 } },
  // A fall returns the player to their last rest (the rest system's death rule): hazards only hurt.
  composedParams: { hazards: { respawn: false } },
  entityRoles: { ...Object.fromEntries(Object.keys(RELIC_ABILITY).map((t) => [t, ['relic' as const]])), [ALTAR_TYPE]: ['altar'] },
};
