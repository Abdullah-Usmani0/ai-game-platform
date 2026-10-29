import type { EntityRoster, FreeformSystemsJson, ParamValue } from '@gg/schemas';
import type { GenreRuntime, SystemModule } from '@gg/template-core';
import { deathSwitches, err, type Issue } from '@gg/validators';
import { RUNTIMES, SYSTEMS, vocabFor } from './registry.js';
import { emitsOf } from './retype.js';
import { compileRoster, type CompiledRoster } from './roster.js';

export interface Composed {
  /** The game as a runtime like any genre's: what simOptionsFor, the bots, the checks and the editor work with. */
  runtime: GenreRuntime;
  roster: CompiledRoster;
  /** Unknown systems and roster problems; the composition rules (checkComposition) are checked on their own. */
  issues: Issue[];
}

/** An empty roster: every entity of the base genre under its own name. */
export const IDENTITY_ROSTER: EntityRoster = { version: 1, designNotes: '', player: {}, types: [] };

/**
 * A freeform game as a runtime: its selected systems from any genre, its roster's entities, and the rest from its base
 * genre (feel presets, player body, movement mode); behaviours speak the vocabulary of that movement mode. The
 * composition sets what models never do: the roster's names in the systems' entity parameters, and the switches of
 * death rules that yield to another (hazards' respawn when the objectives own death).
 */
export function compose(file: FreeformSystemsJson, roster: EntityRoster = IDENTITY_ROSTER): Composed {
  const base = RUNTIMES[file.composition.base];
  const ids = file.systems.map((s) => s.id);
  const issues: Issue[] = [];
  const systems: Record<string, SystemModule> = {};
  for (const id of ids) {
    const mod = SYSTEMS[id];
    if (mod) systems[id] = { meta: mod.meta, create: mod.create };
    else issues.push(err('unknown_system', `no system '${id}' in any genre's catalog`, { path: id }));
  }
  const compiled = compileRoster(file.composition.base, roster, ids);
  issues.push(...compiled.issues);
  const composedParams: Record<string, Record<string, ParamValue>> = {};
  for (const [id, params] of [...Object.entries(compiled.entityParams), ...Object.entries(deathSwitches(Object.values(systems).map((m) => m.meta)))]) composedParams[id] = { ...composedParams[id], ...params };
  // Feedback for the custom events the game fires, from the genres that ship them: the selected systems' (a finisher, a
  // door opening) and its entities' behaviours' (a boss's slam).
  const fired = new Set([...Object.values(systems).flatMap((m) => m.meta.emits), ...compiled.behaviours.flatMap(emitsOf)]);
  const feedbackExtras: NonNullable<GenreRuntime['feedbackExtras']> = [];
  for (const rt of Object.values(RUNTIMES)) for (const x of rt.feedbackExtras ?? []) if (fired.has(x.event) && !feedbackExtras.some((f) => f.event === x.event)) feedbackExtras.push(x);
  // A shared system takes the base genre's defaults, else those of the genre it comes from.
  const paramDefaults: Record<string, Record<string, ParamValue>> = {};
  for (const id of ids) {
    const home = SYSTEMS[id]?.genres[0];
    const d = base.paramDefaults?.[id] ?? (home ? RUNTIMES[home].paramDefaults?.[id] : undefined);
    if (d) paramDefaults[id] = d;
  }
  const runtime: GenreRuntime = {
    id: 'freeform',
    name: `Freeform on ${base.name.toLowerCase()}`,
    movementMode: base.movementMode,
    systems,
    requiredSystems: ids.filter((id) => systems[id]),
    optionalSystems: [],
    feelPresets: base.feelPresets,
    defaultFeel: base.defaultFeel,
    entityDefs: compiled.defs,
    player: compiled.player,
    behaviourVocab: vocabFor(base.movementMode),
    defaultBehaviours: compiled.behaviours,
    defaultRules: [],
    collectibleTypes: compiled.defs.filter((d) => d.pickup).map((d) => d.type),
    feedbackExtras,
    paramDefaults,
    entityRoles: compiled.roles,
    composedParams,
  };
  return { runtime, roster: compiled, issues };
}
