import type { BehaviourFsm, CuratedGenre } from '@gg/schemas';
import type { EntityDef } from '@gg/sdk';
import { metroidvaniaRuntime } from '@gg/template-metroidvania';
import { autoRun, autoRunMeta, platformerRuntime } from '@gg/template-platformer';
import { puzzleRuntime } from '@gg/template-puzzle';
import { lifesimRuntime } from '@gg/template-lifesim';
import { shmupRuntime } from '@gg/template-shmup';
import { survivorsRuntime } from '@gg/template-survivors';
import { topdownActionRuntime } from '@gg/template-topdown-action';
import { objectives, objectivesMeta, rolesOf, type GenreRuntime, type SystemModule } from '@gg/template-core';
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
 * Every system by id, with the genres that ship it (the first is its home); the shared objectives belong to none, and
 * neither does the runner, which only freeform games compose.
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
  out[autoRunMeta.id] = { meta: autoRunMeta, create: () => autoRun, genres: [] };
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

/** A shipped entity of a curated genre, as a freeform game's roster names it: '<genre>:<type>'. */
export interface Archetype {
  id: string;
  genre: CuratedGenre;
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
  return out;
})();

/** The archetype a system's entity parameter names by default: its type in a genre that ships the system with it. */
export function paramArchetype(systemId: string, type: string): string | null {
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
