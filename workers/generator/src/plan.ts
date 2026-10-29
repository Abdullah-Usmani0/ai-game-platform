import type { EditRouteName } from '@gg/schemas';
import { applyPreset, type StagePresets } from './presets.js';
import type { StageSpec } from './runners/types.js';

/** The create pipeline, in order. Assets run in parallel in phase 2; phase 1 games are code-drawn. */
export const CREATE_STAGES = ['gdd', 'systems', 'scaffold', 'behaviour', 'implement', 'levels', 'integrate', 'playtest', 'juice', 'review', 'budget', 'publish'] as const;

/** Edit routes: no full regeneration; each route runs the smallest set of stages that re-verifies the game. */
export const EDIT_PLANS: Record<EditRouteName, string[]> = {
  parameter: ['apply-params', 'budget', 'publish'],
  style: ['apply-style', 'budget', 'publish'],
  behaviour: ['behaviour', 'playtest', 'budget', 'publish'],
  content: ['levels', 'playtest', 'budget', 'publish'],
  code: ['implement', 'playtest', 'juice', 'review', 'budget', 'publish'],
};

export function createPlan(presets: StagePresets): StageSpec[] {
  return CREATE_STAGES.map((stage) => applyPreset({ stage, gate: [] }, presets));
}

/** Authored content (the level editor): written as given once the validator and the solver bot accept it; no model call. */
export const AUTHORED_CONTENT_PLAN = ['apply-content', 'playtest', 'budget', 'publish'];

export function editPlan(route: EditRouteName, presets: StagePresets, authored = false): StageSpec[] {
  const stages = authored && route === 'content' ? AUTHORED_CONTENT_PLAN : EDIT_PLANS[route];
  return stages.map((stage) => applyPreset({ stage, gate: [] }, presets));
}
