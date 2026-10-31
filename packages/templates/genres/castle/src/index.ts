import { pickups, pickupsMeta, rest, restMeta, rooms, roomsMeta, type GenreRuntime, type SystemModule } from '@gg/template-core';
import { metroidvaniaRuntime } from '@gg/template-metroidvania';
import { platformerRuntime } from '@gg/template-platformer';
import { DEFAULT_BEHAVIOURS, VOCAB } from './behaviours.js';
import { ALTAR_TYPE, COLLECTIBLE_TYPES, ENTITY_DEFS, PLAYER, RELIC_ABILITY } from './entities.js';
import { DEFAULT_FEEL, FEEL } from './feel.js';
import { meta as movementMeta, movement } from './movement.js';
import { abilities, meta as abilitiesMeta } from './systems/abilities.js';
import { arena, meta as arenaMeta } from './systems/arena.js';
import { combat, meta as combatMeta } from './systems/combat.js';
import { meta as shortcutsMeta, shortcuts } from './systems/shortcuts.js';

export * from './feel.js';
export * from './entities.js';
export * from './behaviours.js';
export * from './moves.js';
export { movement, abilities, shortcuts, combat, arena };
export { BLOCK_TICKS, BOSS_POISE, BUFFER_TICKS, FLASKS, GUARD, GUARD_AT, GUARD_BREAK_TICKS, GUARD_REFILL_TICKS, guardUp, HURT_AIR_TICKS, HURT_TICKS, LOCK, OPEN_UNTIL, PARRY_STAGGER_TICKS, PLUNGE_BOUNCE } from './systems/combat.js';

/** A shared system as the castle offers it: the same code, listed for the castle. */
const forCastle = (mod: SystemModule | undefined): SystemModule => ({ meta: { ...mod!.meta, genres: ['castle'] }, create: mod!.create });

/**
 * Browser-safe runtime description of the castle genre, the tier of large heroes on 16 px tiles: a region of rooms
 * with save altars, the metroidvania's relics, the platformer's hazards and goal, and a sword whose moves are data.
 */
export const castleRuntime: GenreRuntime = {
  id: 'castle',
  name: 'Castle explorer',
  movementMode: 'platformer',
  tier: 'castle',
  systems: {
    [combatMeta.id]: { meta: combatMeta, create: () => combat },
    [movementMeta.id]: { meta: movementMeta, create: () => movement },
    relics: forCastle(metroidvaniaRuntime.systems['relics']),
    [abilitiesMeta.id]: { meta: abilitiesMeta, create: () => abilities },
    [shortcutsMeta.id]: { meta: shortcutsMeta, create: () => shortcuts },
    [arenaMeta.id]: { meta: arenaMeta, create: () => arena },
    [roomsMeta.id]: { meta: roomsMeta, create: () => rooms },
    [restMeta.id]: { meta: restMeta, create: () => rest },
    hazards: forCastle(platformerRuntime.systems['hazards']),
    goal: forCastle(platformerRuntime.systems['goal']),
    [pickupsMeta.id]: forCastle({ meta: pickupsMeta, create: () => pickups }),
  },
  // The sword before the movement: a cut pressed this tick roots the hero this tick.
  requiredSystems: ['combat', 'movement-castle', 'relics', 'abilities', 'rooms', 'rest', 'shortcuts', 'arena', 'hazards', 'goal'],
  optionalSystems: ['pickups'],
  feelPresets: FEEL,
  defaultFeel: DEFAULT_FEEL,
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviourVocab: VOCAB,
  defaultBehaviours: DEFAULT_BEHAVIOURS,
  defaultRules: [],
  collectibleTypes: COLLECTIBLE_TYPES,
  feedbackExtras: [
    { event: 'custom:rest', channels: ['sfx', 'flash'] },
    { event: 'custom:door_open', channels: ['sfx', 'shake'] },
    { event: 'custom:swing', channels: ['sfx'] },
    { event: 'custom:finisher', channels: ['sfx', 'shake'] },
    { event: 'custom:block', channels: ['sfx'] },
    { event: 'custom:guard_break', channels: ['sfx', 'shake'] },
    { event: 'custom:parry', channels: ['sfx', 'flash'] },
    { event: 'custom:drink', channels: ['sfx'] },
    { event: 'custom:heal', channels: ['sfx', 'particle'] },
    { event: 'custom:dodge', channels: ['sfx'] },
    { event: 'custom:boss', channels: ['sfx', 'shake'] },
    { event: 'custom:enrage', channels: ['sfx', 'shake'] },
    { event: 'custom:arena_shut', channels: ['sfx', 'shake'] },
    { event: 'custom:arena_open', channels: ['sfx'] },
  ],
  // A fall returns the player to their last rest (the rest system's death rule): hazards only hurt.
  composedParams: { hazards: { respawn: false } },
  entityRoles: { ...Object.fromEntries(Object.keys(RELIC_ABILITY).map((t) => [t, ['relic' as const]])), [ALTAR_TYPE]: ['altar'] },
};
