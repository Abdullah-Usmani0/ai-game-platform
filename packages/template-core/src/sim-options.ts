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
 * template systems in systems.json order, then bespoke systems, then the feedback binder.
 */
export function simOptionsFor(runtime: GenreRuntime, systems: SystemsJson, inputs: SimOptionsInputs = {}): Omit<SimOptions, 'level' | 'seed'> {
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
    params: Object.fromEntries(systems.systems.map((s) => [s.id, s.params])),
    content: inputs.content ?? {},
    movementMode: runtime.movementMode,
  };
}
