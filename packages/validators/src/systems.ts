import type { GddFrontmatter, SystemsJson } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

export interface CatalogParam {
  type: 'number' | 'string' | 'boolean';
  min?: number;
  max?: number;
  values?: string[];
  default: number | string | boolean;
  /** What a change invalidates: levels (re-validate), assets (regenerate), none. */
  affects: 'levels' | 'assets' | 'none';
}

export interface CatalogSystem {
  id: string;
  genres: string[] | '*';
  required?: boolean;
  summary: string;
  params: Record<string, CatalogParam>;
  emits: string[];
  /** Feedback events this system can bind channels for. */
  feedbackFor: string[];
}

export type SystemsCatalog = Record<string, CatalogSystem>;

export function checkSystems(systems: SystemsJson, catalog: SystemsCatalog, gdd?: GddFrontmatter): ValidationReport {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const s of systems.systems) {
    if (ids.has(s.id)) issues.push(err('duplicate_system', `system '${s.id}' listed twice`, { path: s.id }));
    ids.add(s.id);
    const cat = catalog[s.id];
    if (!cat) {
      issues.push(err('unknown_system', `system '${s.id}' is not in the catalog`, { path: s.id }));
      continue;
    }
    if (cat.genres !== '*' && !cat.genres.includes(systems.genre)) issues.push(err('system_wrong_genre', `system '${s.id}' is not available for genre '${systems.genre}'`, { path: s.id }));
    for (const [k, v] of Object.entries(s.params)) {
      const p = cat.params[k];
      if (!p) {
        issues.push(err('unknown_param', `system '${s.id}' has no parameter '${k}'`, { path: `${s.id}.${k}` }));
        continue;
      }
      if (typeof v !== p.type) issues.push(err('param_type', `${s.id}.${k} should be ${p.type}`, { path: `${s.id}.${k}` }));
      else if (p.type === 'number' && typeof v === 'number' && ((p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max))) issues.push(err('param_range', `${s.id}.${k}=${v} outside [${p.min ?? '-inf'}, ${p.max ?? 'inf'}]`, { path: `${s.id}.${k}` }));
      else if (p.type === 'string' && p.values && typeof v === 'string' && !p.values.includes(v)) issues.push(err('param_enum', `${s.id}.${k}='${v}' not one of ${p.values.join('|')}`, { path: `${s.id}.${k}` }));
    }
  }
  for (const [id, cat] of Object.entries(catalog)) {
    if (cat.required && (cat.genres === '*' || cat.genres.includes(systems.genre)) && !ids.has(id)) issues.push(err('required_system_missing', `required system '${id}' is missing for genre '${systems.genre}'`, { path: id }));
  }
  if (gdd) {
    const bindable = new Set(systems.systems.flatMap((s) => catalog[s.id]?.feedbackFor ?? []));
    for (const fe of gdd.feedbackEvents) if (!bindable.has(fe.event)) issues.push(warn('feedback_unbound', `no selected system can bind feedback for '${fe.event}'`));
  }
  return report(issues, { systems: systems.systems.length });
}

/** Which downstream artifacts a systems.json change invalidates, by the catalog's `affects` metadata. */
export function impact(before: SystemsJson, after: SystemsJson, catalog: SystemsCatalog): { levels: boolean; assets: boolean; code: boolean; changed: string[] } {
  const changed: string[] = [];
  let levels = false;
  let assets = false;
  let code = false;
  const b = new Map(before.systems.map((s) => [s.id, s]));
  const a = new Map(after.systems.map((s) => [s.id, s]));
  for (const id of new Set([...b.keys(), ...a.keys()])) {
    const x = b.get(id);
    const y = a.get(id);
    if (!x || !y) {
      changed.push(id);
      code = true;
      levels = true;
      continue;
    }
    for (const k of new Set([...Object.keys(x.params), ...Object.keys(y.params)])) {
      if (x.params[k] === y.params[k]) continue;
      changed.push(`${id}.${k}`);
      const aff = catalog[id]?.params[k]?.affects ?? 'none';
      if (aff === 'levels') levels = true;
      if (aff === 'assets') assets = true;
    }
  }
  if (before.feelPreset !== after.feelPreset) {
    changed.push('feelPreset');
    levels = true;
  }
  return { levels, assets, code, changed };
}
