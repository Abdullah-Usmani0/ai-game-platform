import type { BehaviourFsm, CuratedGenre } from '@gg/schemas';
import type { EntityDef } from '@gg/sdk';
import { metroidvaniaRuntime } from '@gg/template-metroidvania';
import { autoRun, autoRunMeta, platformerRuntime } from '@gg/template-platformer';
import { puzzleRuntime } from '@gg/template-puzzle';
import { lifesimRuntime } from '@gg/template-lifesim';
import { shmupRuntime } from '@gg/template-shmup';
import { survivorsRuntime } from '@gg/template-survivors';
import { topdownActionRuntime } from '@gg/template-topdown-action';
import { carryBlock, objectives, ordersBlock, objectivesMeta, rolesOf, type BlockModule, type GenreRuntime, type SystemModule } from '@gg/template-core';
import type { EntityRole, MovementKind, SystemsCatalog } from '@gg/validators';

/** The curated genres' runtimes: every system, entity and behaviour a freeform game can be made of. */
export const RUNTIMES: Readonly<Record<CuratedGenre, GenreRuntime>> = {
  platformer: platformerRuntime,
  survivors: survivorsRuntime,
  'topdown-action': topdownActionRuntime,
  metroidvania: metroidvaniaRuntime,
  shmup: shmupRuntime,
  puzzle: puzzleRuntime,
  lifesim: lifesimRuntime,
};
export const CURATED_IDS = Object.keys(RUNTIMES) as CuratedGenre[];

/**
 * The blocks only freeform games compose: systems that belong to no genre, some with what they bring beyond the system
 * (a courier's job brings its own entities, the stations it places on every level and the bot that plays it).
 */
export const BLOCKS: Readonly<Record<string, BlockModule>> = {
  [autoRunMeta.id]: { meta: autoRunMeta, create: () => autoRun },
  [carryBlock.meta.id]: carryBlock,
  [ordersBlock.meta.id]: ordersBlock,
};

/**
 * Every system by id, with the genres that ship it (the first is its home); the shared objectives belong to none, and
 * neither do the blocks only freeform games compose.
 */
export const SYSTEMS: Readonly<Record<string, SystemModule & { genres: CuratedGenre[] }>> = (() => {
  const out: Record<string, SystemModule & { genres: CuratedGenre[] }> = {};
  for (const id of CURATED_IDS) {
    for (const [sid, mod] of Object.entries(RUNTIMES[id].systems)) {
      const known = out[sid];
      if (known) known.genres.push(id);
      else out[sid] = { ...mod, genres: [id] };
    }
  }
  out[objectivesMeta.id] = { meta: objectivesMeta, create: () => objectives, genres: [] };
  for (const [id, b] of Object.entries(BLOCKS)) out[id] = { meta: b.meta, create: b.create, genres: [] };
  return out;
})();

/** The catalog a freeform game's systems.json is checked against: every system, the shared objectives included. */
export const FREEFORM_CATALOG: SystemsCatalog = Object.fromEntries(Object.entries(SYSTEMS).map(([id, m]) => [id, m.meta]));

/** How a curated genre's player moves: what its movement system provides. */
export function movementOf(genre: CuratedGenre): MovementKind {
  const rt = RUNTIMES[genre];
  for (const id of rt.requiredSystems) {
    const kind = rt.systems[id]?.meta.provides?.movement;
    if (kind) return kind;
  }
  throw new Error(`genre ${genre} has no movement system`);
}

/** The systems a freeform game on a base can use: any that works with the base's movement, and none that moves the player another way. */
export function usableSystems(base: CuratedGenre): string[] {
  const kind = movementOf(base);
  return Object.entries(SYSTEMS)
    .filter(([, m]) => (m.meta.provides?.movement ?? kind) === kind && (m.meta.requires?.movement ?? [kind]).includes(kind))
    .map(([id]) => id);
}

/**
 * A shipped entity, as a freeform game's roster names it: a curated genre's ('<genre>:<type>'), or a block's own
 * ('<block>:<type>', a courier's cargo), which works whatever way the player moves and comes with its block.
 */
export interface Archetype {
  id: string;
  /** The genre that ships it; null for a block's own. */
  genre: CuratedGenre | null;
  /** The block that brings it. */
  block?: string;
  def: EntityDef;
  /** The behaviour it runs in its genre (null for items and projectiles without one). */
  behaviour: BehaviourFsm | null;
  roles: EntityRole[];
}

export const ARCHETYPES: Readonly<Record<string, Archetype>> = (() => {
  const out: Record<string, Archetype> = {};
  for (const genre of CURATED_IDS) {
    const rt = RUNTIMES[genre];
    const roles = rolesOf(rt);
    for (const def of rt.entityDefs) {
      const id = `${genre}:${def.type}`;
      out[id] = { id, genre, def, behaviour: def.fsm ? (rt.defaultBehaviours.find((b) => b.id === def.fsm) ?? null) : null, roles: [...(roles.get(def.type) ?? [])] };
    }
  }
  for (const [block, b] of Object.entries(BLOCKS)) {
    for (const a of b.archetypes ?? []) out[`${block}:${a.def.type}`] = { id: `${block}:${a.def.type}`, genre: null, block, def: a.def, behaviour: null, roles: [...a.roles] };
  }
  return out;
})();

/**
 * The archetype a system's entity parameter names by default: the block's own entity of that name (a courier's cargo),
 * else its type in a genre that ships the system with it.
 */
export function paramArchetype(systemId: string, type: string): string | null {
  // A block's own entity first: the courier's cargo is its own, whatever genre ships something of that name.
  if (ARCHETYPES[`${systemId}:${type}`]?.block === systemId) return `${systemId}:${type}`;
  for (const genre of SYSTEMS[systemId]?.genres ?? []) if (ARCHETYPES[`${genre}:${type}`]) return `${genre}:${type}`;
  return null;
}

/** The behaviour vocabulary of a movement mode: every condition and action some curated genre moving that way uses. */
export function vocabFor(mode: GenreRuntime['movementMode']): GenreRuntime['behaviourVocab'] {
  const conditions: string[] = [];
  const actions: string[] = [];
  for (const id of CURATED_IDS) {
    const rt = RUNTIMES[id];
    if (rt.movementMode !== mode) continue;
    for (const c of rt.behaviourVocab.conditions) if (!conditions.includes(c)) conditions.push(c);
    for (const a of rt.behaviourVocab.actions) if (!actions.includes(a)) actions.push(a);
  }
  return { conditions, actions };
}
