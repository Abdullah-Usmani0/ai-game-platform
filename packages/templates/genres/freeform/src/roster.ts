import type { BehaviourFsm, CuratedGenre, EntityRoster, ParamValue } from '@gg/schemas';
import type { EntityDef } from '@gg/sdk';
import { err, type EntityRole, type Issue } from '@gg/validators';
import { ARCHETYPES, RUNTIMES, SYSTEMS, paramArchetype, type Archetype } from './registry.js';
import { projectilesOf, retypeFsm } from './retype.js';

/** A roster made playable: the definitions and behaviours of the game's entity types, and the names that connect them. */
export interface CompiledRoster {
  /** Each shipped entity the game uses, under the game's name, drawn as the shipped type, with its health scaled. */
  defs: EntityDef[];
  /** The game's type for each archetype it uses ('topdown-action:grunt' -> 'wolf'). */
  typeOf: ReadonlyMap<string, string>;
  /** Base-genre type to game type: renames what the base genre generates (levels, waves). */
  rename: ReadonlyMap<string, string>;
  /** The behaviours the definitions run, firing projectiles under the game's names. */
  behaviours: BehaviourFsm[];
  /** What each of the game's types is for. */
  roles: Record<string, EntityRole[]>;
  /** Entity-type parameters of the selected systems, set to the game's names where they differ from the shipped ones. */
  entityParams: Record<string, Record<string, ParamValue>>;
  player: { w: number; h: number; hp: number };
  issues: Issue[];
}

/**
 * Compiles a freeform game's roster against its base genre and its systems. Every entity the game needs gets a type: the
 * base genre's (its levels and waves place them), the ones the selected systems spawn (a drop, a shot) and the
 * projectiles the included behaviours fire, each under the roster's name when it gives one and its own otherwise. An
 * empty roster reproduces the base genre's entities exactly.
 */
export function compileRoster(base: CuratedGenre, roster: EntityRoster, systemIds: readonly string[]): CompiledRoster {
  const issues: Issue[] = [];
  const baseRt = RUNTIMES[base];
  const named = new Map<string, { type: string; hp: number }>();
  const taken = new Set<string>();
  for (const e of roster.types) {
    const a = ARCHETYPES[e.archetype];
    if (!a) {
      issues.push(err('unknown_archetype', `${e.type}: no shipped entity '${e.archetype}'`, { path: e.type }));
      continue;
    }
    const mode = RUNTIMES[a.genre].movementMode;
    if (mode !== baseRt.movementMode) {
      issues.push(err('archetype_movement', `${e.type}: ${e.archetype} belongs to a ${mode} game, and this one moves ${baseRt.movementMode}`, { path: e.type }));
      continue;
    }
    named.set(a.id, { type: e.type, hp: e.hp });
    taken.add(e.type);
  }

  // What the game needs, in a stable order: the base genre's entities first (so an empty roster is the base genre).
  const queue: string[] = baseRt.entityDefs.map((d) => `${base}:${d.type}`);
  queue.push(...named.keys());
  for (const id of systemIds) {
    for (const p of Object.values(SYSTEMS[id]?.meta.params ?? {})) {
      const a = p.composed === 'entity' ? paramArchetype(id, String(p.default)) : null;
      if (a) queue.push(a);
    }
  }
  const used: Archetype[] = [];
  const typeOf = new Map<string, string>();
  for (let i = 0; i < queue.length; i++) {
    const a = ARCHETYPES[queue[i]!];
    if (!a || typeOf.has(a.id)) continue;
    const given = named.get(a.id)?.type;
    if (!given && taken.has(a.def.type)) {
      issues.push(err('type_taken', `the game needs ${a.id}, but the roster gives its name '${a.def.type}' to another entity (name ${a.id} too)`, { path: a.def.type }));
      continue;
    }
    const type = given ?? a.def.type;
    taken.add(type);
    typeOf.set(a.id, type);
    used.push(a);
    // A behaviour's projectiles come along (an archer brings its arrows).
    for (const p of projectilesOf(a.behaviour)) queue.push(`${a.genre}:${p}`);
  }

  const nameIn = (genre: CuratedGenre) => new Map(used.filter((a) => a.genre === genre).map((a) => [a.def.type, typeOf.get(a.id)!]));
  // Behaviour ids are shared where two genres ship the same behaviour (platformer and metroidvania walkers), and
  // made apart where they differ.
  const fsmOwner = new Map<string, { genre: CuratedGenre; json: string }>();
  const fsmId = (a: Archetype): string | undefined => {
    if (!a.behaviour) return a.def.fsm;
    const json = JSON.stringify(a.behaviour);
    const owner = fsmOwner.get(a.behaviour.id);
    if (!owner) fsmOwner.set(a.behaviour.id, { genre: a.genre, json });
    else if (owner.json !== json) return `${a.genre}-${a.behaviour.id}`;
    return a.behaviour.id;
  };
  const defs: EntityDef[] = [];
  const behaviours: BehaviourFsm[] = [];
  const roles: Record<string, EntityRole[]> = {};
  for (const a of used) {
    const type = typeOf.get(a.id)!;
    const def: EntityDef = { ...a.def, type };
    if (type !== a.def.type) def.drawAs = a.def.type;
    const scale = named.get(a.id)?.hp ?? 1;
    if (scale !== 1) def.hp = Math.max(1, Math.round((a.def.hp ?? 1) * scale));
    const fsm = fsmId(a);
    if (fsm !== undefined) def.fsm = fsm;
    if (a.behaviour && fsm && !behaviours.some((b) => b.id === fsm)) behaviours.push(retypeFsm({ ...a.behaviour, id: fsm }, nameIn(a.genre)));
    defs.push(def);
    roles[type] = a.roles;
  }

  const entityParams: Record<string, Record<string, ParamValue>> = {};
  for (const id of systemIds) {
    for (const [k, p] of Object.entries(SYSTEMS[id]?.meta.params ?? {})) {
      const a = p.composed === 'entity' ? paramArchetype(id, String(p.default)) : null;
      const type = a ? typeOf.get(a) : undefined;
      if (type !== undefined && type !== p.default) (entityParams[id] ??= {})[k] = type;
    }
  }
  return {
    defs,
    typeOf,
    rename: nameIn(base),
    behaviours,
    roles,
    entityParams,
    player: { ...baseRt.player, hp: roster.player.hp ?? baseRt.player.hp },
    issues,
  };
}
