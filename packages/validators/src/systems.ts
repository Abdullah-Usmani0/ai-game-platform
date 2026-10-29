import type { GddFrontmatter, SystemsJson } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

export interface CatalogParam {
  type: 'number' | 'string' | 'boolean';
  min?: number;
  max?: number;
  values?: readonly string[];
  default: number | string | boolean;
  /** What a change invalidates: levels (re-validate), assets (regenerate), none. */
  affects: 'levels' | 'assets' | 'none';
  /**
   * The value names an entity type of the game (the drop a kill leaves, the crate a board pushes). The game's
   * composition sets it when its entities are renamed; it is not a tuning knob, so models and panels never see it.
   */
  entity?: boolean;
}

/** How the player moves. Every game has exactly one system that provides it. */
export type MovementKind = 'platformer' | 'topdown' | 'grid';

/**
 * How a level is won: reach the goal, survive the clock, clear the hostiles then exit, put every crate on a target, or
 * by the clauses of content/objectives.json.
 */
export type WinKind = 'reach_goal' | 'survive' | 'clear_room' | 'place_crates' | 'objectives';

/** What entities in a game are for, whatever their type is called: what systems need to find in a level. */
export type EntityRole = 'hostile' | 'collectible' | 'relic' | 'key' | 'door' | 'crate' | 'target';

/** What a system owns in a game. The composition rules allow one movement, one win and one death owner per game. */
export interface SystemProvides {
  /** The player's movement. */
  movement?: MovementKind;
  /** How the level is won (the system sets the won flag). */
  win?: WinKind;
  /**
   * What the player's death does: respawn at the checkpoint, end the run (the system sets the game-over flag), or
   * respawn until the lives run out, then end it.
   */
  death?: 'respawn' | 'game_over' | 'lives';
  /** How the player deals damage. */
  combat?: 'stomp' | 'melee' | 'shoot' | 'aura';
  /** Entity types the system spawns while the game runs; 'waves' stands for the types its waves content names. */
  spawns?: readonly string[];
}

/** What a system needs from the rest of the game to do its job. */
export interface SystemRequires {
  /** Movement it works with. */
  movement?: readonly MovementKind[];
  /** Entity roles the game must have (a room to clear needs hostiles). */
  roles?: readonly EntityRole[];
  /** Content files the game must ship (waves.json). */
  content?: readonly string[];
}

export interface CatalogSystem {
  id: string;
  genres: readonly string[] | '*';
  required?: boolean;
  summary: string;
  params: Record<string, CatalogParam>;
  emits: readonly string[];
  /** Feedback events this system can bind channels for. */
  feedbackFor: readonly string[];
  /**
   * What the system does with each key it reads (action: 'attack', dash: 'restart'). The play page lists them; bots
   * that explore leave alone the keys marked 'undo' or 'restart' (a save point does that job better).
   */
  controls?: Partial<Record<'left' | 'right' | 'up' | 'down' | 'jump' | 'dash' | 'action' | 'pause', string>>;
  /** What the system owns in a game (movement, the win, the death rule, combat, spawns); checked against its runs. */
  provides?: SystemProvides;
  /** What it needs from the rest of the game. */
  requires?: SystemRequires;
  /** Systems it cannot share a game with. */
  conflicts?: readonly string[];
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
      if (p.entity && v !== p.default) issues.push(err('entity_param', `${s.id}.${k} names an entity type; the game's composition sets it, not systems.json`, { path: `${s.id}.${k}` }));
      else if (typeof v !== p.type) issues.push(err('param_type', `${s.id}.${k} should be ${p.type}`, { path: `${s.id}.${k}` }));
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
