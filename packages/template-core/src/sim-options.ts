import type { BehaviourFsm, EcaRule, SystemsJson } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions, type SystemDef } from '@gg/sdk';
import type { GenreRuntime } from './manifest.js';

export interface SimOptionsInputs {
  behaviours?: BehaviourFsm[];
  rules?: EcaRule[];
  content?: Record<string, unknown>;
  feedback?: FeedbackBinding[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bespoke?: SystemDef<any>[];
}

/**
 * The wiring a scaffolded game's src/game.ts performs, for Node-side tooling (scaffold oracle, playtest, evals):
 * template systems in systems.json order, then bespoke systems, then the feedback binder. The params are systems.json's,
 * under what the game's composition sets (composedParams).
 */
export function simOptionsFor(runtime: GenreRuntime, systems: Pick<SystemsJson, 'feelPreset' | 'systems'>, inputs: SimOptionsInputs = {}): Omit<SimOptions, 'level' | 'seed'> {
  const templateSystems = systems.systems.map((s) => {
    const mod = runtime.systems[s.id];
    if (!mod) throw new Error(`systems.json names unknown system '${s.id}' for genre ${runtime.id}`);
    return mod.create();
  });
  const provided = inputs.behaviours ?? [];
  const behaviours = [...runtime.defaultBehaviours.filter((b) => !provided.some((f) => f.id === b.id)), ...provided];
  return {
    feel: runtime.feelPresets[systems.feelPreset] ?? runtime.feelPresets[runtime.defaultFeel]!,
    systems: [...templateSystems, ...(inputs.bespoke ?? []), feedbackBinder(inputs.feedback ?? [])],
    entityDefs: runtime.entityDefs,
    player: runtime.player,
    behaviours,
    rules: [...runtime.defaultRules, ...(inputs.rules ?? [])],
    params: Object.fromEntries(systems.systems.map((s) => [s.id, { ...s.params, ...runtime.composedParams?.[s.id] }])),
    content: inputs.content ?? {},
    movementMode: runtime.movementMode,
  };
}

/** The time every level gets to be finished in: 90 seconds. */
export const LEVEL_TICKS = 90 * 60;

/**
 * The longest a level of the game can last: 90 seconds, or longer where a system's rules take longer (a survival of
 * fifteen minutes, a farm season of days; SystemDef.levelTicks). Solver runs and proofs of the game's levels stop there.
 */
export function levelTicksOf(options: Pick<SimOptions, 'systems' | 'params' | 'content'>): number {
  // As the sim answers it: a system the game runs has parameters, its own or none.
  const paramsOf = (id: string) => (options.systems.some((s) => s.id === id) ? (options.params?.[id] ?? {}) : undefined);
  let ticks = LEVEL_TICKS;
  for (const s of options.systems) {
    if (!s.levelTicks) continue;
    ticks = Math.max(ticks, Math.ceil(s.levelTicks({ params: options.params?.[s.id] ?? {}, paramsOf, content: options.content ?? {} })));
  }
  return ticks;
}

/**
 * A systems.json drafted from a genre: the named systems (by default every required and optional one), each with the
 * catalog's default parameters under the genre's own (paramDefaults). The scaffold, the golden lock and the sweeps use it.
 */
export function systemsJsonFor(runtime: GenreRuntime, ids: readonly string[] = [...runtime.requiredSystems, ...runtime.optionalSystems]): SystemsJson {
  if (runtime.id === 'freeform') throw new Error("a freeform game's systems.json names its base genre: it comes from the game's composition");
  return {
    version: 1,
    genre: runtime.id,
    feelPreset: runtime.defaultFeel,
    systems: ids.map((id) => {
      const mod = runtime.systems[id];
      if (!mod) throw new Error(`genre ${runtime.id} has no system '${id}'`);
      // Composed params are left out: their defaults apply, and only a game's composition sets them.
      const tunable = Object.entries(mod.meta.params).filter(([, p]) => !p.composed);
      return { id, params: { ...Object.fromEntries(tunable.map(([k, p]) => [k, p.default])), ...(runtime.paramDefaults?.[id] ?? {}) } };
    }),
  };
}
