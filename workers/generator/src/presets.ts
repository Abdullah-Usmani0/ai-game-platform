import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StageSpec } from './runners/types.js';

/** One entry of harness/stages.json: the gate, write scope, caps, skills and default task of a stage. */
export interface StagePreset {
  runner?: StageSpec['runner'];
  gate: string[];
  allowedWrite?: string[];
  caps?: { turns: number; usd: number; wallMin: number };
  seeds?: number[];
  ticks?: number;
  skills?: string[];
  task?: string;
  /** Run the gate before any model session on the first attempt; skip the session when it already passes. */
  gateFirst?: boolean;
}
export type StagePresets = Record<string, StagePreset>;

export function loadPresets(templateDir: string): StagePresets {
  const p = join(templateDir, 'stages.json');
  if (!existsSync(p)) return {};
  const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  const out: StagePresets = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith('$') && v && typeof v === 'object') out[k] = v as StagePreset;
  return out;
}

/** Fill a stage spec from its preset; explicit spec fields win. */
export function applyPreset(spec: StageSpec, presets: StagePresets): StageSpec {
  const p = presets[spec.stage];
  if (!p) return spec;
  return {
    ...spec,
    runner: spec.runner ?? p.runner,
    gate: spec.gate.length ? spec.gate : p.gate,
    allowedWrite: spec.allowedWrite ?? p.allowedWrite,
    seeds: spec.seeds ?? p.seeds,
    ticks: spec.ticks ?? p.ticks,
    skills: spec.skills ?? p.skills,
    task: spec.task ?? p.task,
    caps: spec.caps ?? p.caps,
    gateFirst: spec.gateFirst ?? p.gateFirst,
  };
}
