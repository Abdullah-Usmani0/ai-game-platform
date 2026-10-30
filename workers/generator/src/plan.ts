import type { EditRouteName } from '@gg/schemas';
import { applyPreset, type StagePresets } from './presets.js';
import type { StageSpec } from './runners/types.js';

/** The create pipeline, in order. Assets run in parallel in phase 2; phase 1 games are code-drawn. */
export const CREATE_STAGES = ['gdd', 'systems', 'sprites', 'scaffold', 'behaviour', 'implement', 'levels', 'integrate', 'playtest', 'juice', 'review', 'budget', 'publish'] as const;

/** Edit routes: no full regeneration; each route runs the smallest set of stages that re-verifies the game. */
export const EDIT_PLANS: Record<EditRouteName, string[]> = {
  parameter: ['apply-params', 'budget', 'publish'],
  style: ['apply-style', 'budget', 'publish'],
  behaviour: ['behaviour', 'playtest', 'budget', 'publish'],
  content: ['levels', 'playtest', 'budget', 'publish'],
  code: ['implement', 'playtest', 'juice', 'review', 'budget', 'publish'],
};

/**
 * A freeform game's stages besides a curated one's: it names its entities and writes its rules right after choosing its
 * systems, records a winning run for every level again after its code changes (the other stages that change how it
 * plays prove the levels themselves), and once its levels are made and proven, writes a bot of its own for levels no
 * bot of the platform wins (a stage that runs only when the game has code of its own and levels wait).
 */
function forFreeform(stages: readonly string[]): string[] {
  const out = stages.flatMap((s) => (s === 'systems' ? [s, 'composition'] : s === 'implement' ? [s, 'prove'] : [s]));
  const last = Math.max(out.lastIndexOf('levels'), out.lastIndexOf('prove'));
  return last < 0 ? out : [...out.slice(0, last + 1), 'bot', ...out.slice(last + 1)];
}

export function createPlan(presets: StagePresets, opts: { freeform?: boolean } = {}): StageSpec[] {
  return (opts.freeform ? forFreeform(CREATE_STAGES) : [...CREATE_STAGES]).map((stage) => applyPreset({ stage, gate: [] }, presets));
}

/** Authored content (the level editor): written as given once the validator and the solver bot accept it; no model call. */
export const AUTHORED_CONTENT_PLAN = ['apply-content', 'playtest', 'budget', 'publish'];

export function editPlan(route: EditRouteName, presets: StagePresets, authored = false, opts: { freeform?: boolean } = {}): StageSpec[] {
  const stages = authored && route === 'content' ? AUTHORED_CONTENT_PLAN : EDIT_PLANS[route];
  return (opts.freeform ? forFreeform(stages) : stages).map((stage) => applyPreset({ stage, gate: [] }, presets));
}
