import type { GddFrontmatter, Mechanic, SystemsFile, SystemsJson } from '@gg/schemas';
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
   * Set by the game's composition, not a tuning knob: models and panels never see it, and systems.json keeps the
   * default. 'entity': the value names an entity type of the game (the drop a kill leaves, the crate a board pushes),
   * set when the roster renames it. 'switch': it turns off a duty another system of the game owns (hazards' respawn,
   * when the objectives decide what a death does).
   */
  composed?: 'entity' | 'switch';
  /** The values a string parameter may take with a movement some of its values make no sense with (shots fired straight up in a side view). */
  valuesWith?: Partial<Record<'platformer' | 'topdown' | 'grid', readonly string[]>>;
}

/** How the player moves. Every game has exactly one system that provides it. */
export type MovementKind = 'platformer' | 'topdown' | 'grid';

/**
 * How a level is won: reach the goal, survive the clock, clear the hostiles then exit, put every crate on a target, earn
 * a season's gold quota, or by the clauses of content/objectives.json.
 */
export type WinKind = 'reach_goal' | 'survive' | 'clear_room' | 'place_crates' | 'earn' | 'objectives';

/**
 * What entities in a game are for, whatever their type is called: what systems need to find in a level. A farm's soil
 * plots, seed shop, shipping bin and bed are roles too.
 */
export type EntityRole = 'hostile' | 'collectible' | 'relic' | 'key' | 'door' | 'crate' | 'target' | 'plot' | 'shop' | 'bin' | 'bed';

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
  /**
   * The boolean parameter that turns the death rule off while the system goes on hurting (hazards' respawn): such a rule
   * yields to another system's, and the composition switches it off.
   */
  deathSwitch?: string;
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
  /** Other systems it works with and cannot do without (crops grow overnight: the farm needs the day clock). */
  systems?: readonly string[];
}

/** The keys a system can read: the SDK's inputs. */
export type ControlKey = 'left' | 'right' | 'up' | 'down' | 'jump' | 'dash' | 'action' | 'pause';

/**
 * When a key is in use: the boolean parameter it needs on (movement-topdown's dash), or a parameter and the values it
 * is read with (player-shooter reads the arrows only while it fires the way the player faces).
 */
export type ControlGate = string | { param: string; values: readonly string[] };

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
  controls?: Partial<Record<ControlKey, string>>;
  /** When a key is in use: a game whose parameters switch it off does not use the key (movement-topdown's dash). */
  controlGates?: Partial<Record<ControlKey, ControlGate>>;
  /**
   * Keys the system takes from the others: they do nothing in its game (a runner runs on its own, so left and right).
   * The play page leaves them out and bots that explore never press them.
   */
  takesOver?: readonly ControlKey[];
  /** What the system owns in a game (movement, the win, the death rule, combat, spawns); checked against its runs. */
  provides?: SystemProvides;
  /** What it needs from the rest of the game. */
  requires?: SystemRequires;
  /** Systems it cannot share a game with. */
  conflicts?: readonly string[];
}

export type SystemsCatalog = Record<string, CatalogSystem>;

/**
 * A bespoke system's contract (design/mechanics.json) as catalog metadata, so the composition rules weigh it with the
 * catalog systems beside it: one movement, one win, one death rule, every need met, no key with two uses. Its own
 * events are what it can bind feedback for.
 */
export function mechanicMeta(m: Mechanic): CatalogSystem {
  return { id: m.id, genres: '*', summary: m.summary, params: {}, emits: m.emits, feedbackFor: m.emits, controls: m.controls, provides: m.provides, requires: m.requires };
}

/**
 * A systems.json against the catalog: known systems, known parameters in range and of the right type, composed parameters
 * left alone, every feedback event bindable. A curated game takes its genre's systems, and its required ones; a freeform
 * game takes systems from every genre's catalog, held together by the composition rules (checkComposition) instead.
 */
export function checkSystems(systems: SystemsFile, catalog: SystemsCatalog, gdd?: Pick<GddFrontmatter, 'feedbackEvents'>): ValidationReport {
  const issues: Issue[] = [];
  const freeform = systems.genre === 'freeform';
  const ids = new Set<string>();
  const movement = systems.systems.map((s) => catalog[s.id]?.provides?.movement).find((m) => m !== undefined);
  for (const s of systems.systems) {
    if (ids.has(s.id)) issues.push(err('duplicate_system', `system '${s.id}' listed twice`, { path: s.id }));
    ids.add(s.id);
    const cat = catalog[s.id];
    if (!cat) {
      issues.push(err('unknown_system', `system '${s.id}' is not in the catalog`, { path: s.id }));
      continue;
    }
    if (!freeform && cat.genres !== '*' && !cat.genres.includes(systems.genre)) issues.push(err('system_wrong_genre', `system '${s.id}' is not available for genre '${systems.genre}'`, { path: s.id }));
    for (const [k, v] of Object.entries(s.params)) {
      const p = cat.params[k];
      if (!p) {
        issues.push(err('unknown_param', `system '${s.id}' has no parameter '${k}'`, { path: `${s.id}.${k}` }));
        continue;
      }
      if (p.composed && v !== p.default) issues.push(err('composed_param', `${s.id}.${k} is set by the game's composition (${p.composed === 'entity' ? 'an entity type' : 'a switch'}), not systems.json`, { path: `${s.id}.${k}` }));
      else if (typeof v !== p.type) issues.push(err('param_type', `${s.id}.${k} should be ${p.type}`, { path: `${s.id}.${k}` }));
      else if (p.type === 'number' && typeof v === 'number' && ((p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max))) issues.push(err('param_range', `${s.id}.${k}=${v} outside [${p.min ?? '-inf'}, ${p.max ?? 'inf'}]`, { path: `${s.id}.${k}` }));
      else if (p.type === 'string' && p.values && typeof v === 'string' && !p.values.includes(v)) issues.push(err('param_enum', `${s.id}.${k}='${v}' not one of ${p.values.join('|')}`, { path: `${s.id}.${k}` }));
    }
    // A value the game's movement makes no sense of, the default included.
    for (const [k, p] of Object.entries(cat.params)) {
      const allowed = movement ? p.valuesWith?.[movement] : undefined;
      const v = s.params[k] ?? p.default;
      if (allowed && typeof v === 'string' && !allowed.includes(v)) issues.push(err('param_movement', `${s.id}.${k}='${v}' does not work with ${movement} movement: set it to ${allowed.map((a) => `'${a}'`).join(' or ')}`, { path: `${s.id}.${k}` }));
    }
  }
  for (const [id, cat] of Object.entries(catalog)) {
    if (!freeform && cat.required && (cat.genres === '*' || cat.genres.includes(systems.genre)) && !ids.has(id)) issues.push(err('required_system_missing', `required system '${id}' is missing for genre '${systems.genre}'`, { path: id }));
  }
  if (gdd) {
    const bindable = new Set(systems.systems.flatMap((s) => catalog[s.id]?.feedbackFor ?? []));
    for (const fe of gdd.feedbackEvents) if (!bindable.has(fe.event)) issues.push(warn('feedback_unbound', `no selected system can bind feedback for '${fe.event}'`));
  }
  return report(issues, { systems: systems.systems.length });
}

/** Which downstream artifacts a systems.json change invalidates, by the catalog's `affects` metadata. */
export function impact(before: Pick<SystemsJson, 'feelPreset' | 'systems'>, after: Pick<SystemsJson, 'feelPreset' | 'systems'>, catalog: SystemsCatalog): { levels: boolean; assets: boolean; code: boolean; changed: string[] } {
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

/** Where each input sits on the keyboard (the SDK's bindings), as the play page names it. */
const KEY_NAMES = { jump: 'Z / Space', dash: 'X / Shift', action: 'E / Enter', pause: 'Esc / P' } as const;

/**
 * What a system does with each key it reads, with the parameters a game gives it: its declared controls, less the keys
 * those parameters switch off.
 */
export function controlsInUse(meta: Pick<CatalogSystem, 'controls' | 'controlGates' | 'params'>, params?: Readonly<Record<string, unknown>>): Partial<Record<ControlKey, string>> {
  const out: Partial<Record<ControlKey, string>> = {};
  for (const [key, what] of Object.entries(meta.controls ?? {}) as Array<[ControlKey, string | undefined]>) {
    const gate = meta.controlGates?.[key];
    const param = gate === undefined ? undefined : typeof gate === 'string' ? gate : gate.param;
    const value = param === undefined ? undefined : (params?.[param] ?? meta.params[param]?.default);
    const on = gate === undefined || (typeof gate === 'string' ? value !== false : gate.values.includes(String(value)));
    if (what && on) out[key] = what;
  }
  return out;
}

/**
 * The keys a game uses and what each does in it, from its systems' declared controls (catalog systems with the values
 * the game gives their parameters, its own systems' contracts): the movement keys first (arrows and WASD, or left and
 * right only), then jump, dash and action, then pause. A key a parameter switches off is left out, and so is a key a
 * system takes over (a runner's left and right).
 */
export function controlsLegend(systems: ReadonlyArray<{ meta: Pick<CatalogSystem, 'controls' | 'controlGates' | 'params' | 'takesOver'> | undefined; params?: Readonly<Record<string, unknown>> }>): Array<[keys: string, action: string]> {
  const taken = new Set<string>(systems.flatMap(({ meta }) => meta?.takesOver ?? []));
  const uses = new Map<string, string[]>();
  for (const { meta, params } of systems) {
    if (!meta) continue;
    for (const [key, what] of Object.entries(controlsInUse(meta, params))) {
      if (taken.has(key)) continue;
      const list = uses.get(key) ?? [];
      if (!list.includes(what)) list.push(what);
      uses.set(key, list);
    }
  }
  const out: Array<[string, string]> = [];
  const dirs = ['left', 'right', 'up', 'down'].filter((k) => uses.has(k));
  if (dirs.length > 0) out.push([dirs.includes('up') || dirs.includes('down') ? 'Arrows / WASD' : '← → / A D', [...new Set(dirs.flatMap((k) => uses.get(k)!))].join(', ')]);
  for (const k of ['jump', 'dash', 'action'] as const) if (uses.has(k)) out.push([KEY_NAMES[k], uses.get(k)!.join(', ')]);
  out.push([KEY_NAMES.pause, 'pause']);
  return out;
}

