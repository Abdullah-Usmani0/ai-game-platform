import { err, report, type Issue, type ValidationReport } from './report.js';
import type { CatalogSystem, EntityRole } from './systems.js';

/** What a set of systems is checked against besides itself: the roles the game's entities fill, the content it ships. */
export interface CompositionContext {
  /** Entity roles present in the game. */
  roles: Iterable<EntityRole>;
  /** Content files the game ships (waves). */
  content: Iterable<string>;
}

/** Uses that may share keys with another system's: aiming and facing read the movement keys. */
const SHARED_USES = new Set(['aim', 'face']);

/**
 * Who decides what a death does: the one system whose rule stands. A rule with a switch (provides.deathSwitch, as
 * hazards' respawn has) yields to one without, and the composition turns it off; two rules without a switch clash.
 */
export function deathRule(systems: ReadonlyArray<CatalogSystem>): { owner: CatalogSystem | null; yielding: CatalogSystem[]; clashing: CatalogSystem[] } {
  const rules = systems.filter((s) => s.provides?.death !== undefined);
  const fixed = rules.filter((s) => s.provides!.deathSwitch === undefined);
  const owner = fixed[0] ?? rules[0] ?? null;
  return { owner, yielding: rules.filter((s) => s !== owner && s.provides!.deathSwitch !== undefined), clashing: fixed.length > 1 ? fixed : [] };
}

/** The parameters that switch the yielding death rules off ({ hazards: { respawn: false } }). */
export function deathSwitches(systems: ReadonlyArray<CatalogSystem>): Record<string, Record<string, boolean>> {
  return Object.fromEntries(deathRule(systems).yielding.map((s) => [s.id, { [s.provides!.deathSwitch!]: false }]));
}

/**
 * The rules that make a set of systems one coherent game, whatever genres its systems come from:
 * - exactly one system provides the player's movement, and exactly one owns the win;
 * - one rule decides what a death does (a switchable one yields to another), and there must be one when anything in the
 *   game can hurt the player (a hostile);
 * - every requirement is met: the movement a system works with, the entity roles, content files and systems it needs;
 * - no key has two uses (aiming and facing may share the movement keys; systems may share one use, as a farm's work
 *   the action key does on whatever the player faces), and no listed conflict is selected.
 */
export function checkComposition(systems: ReadonlyArray<CatalogSystem>, ctx: CompositionContext): ValidationReport {
  const issues: Issue[] = [];
  const roles = new Set(ctx.roles);
  const content = new Set(ctx.content);
  const ids = new Set(systems.map((s) => s.id));
  const owners = (pick: (s: CatalogSystem) => unknown) => systems.filter((s) => pick(s) !== undefined);

  const movers = owners((s) => s.provides?.movement);
  if (movers.length === 0) issues.push(err('no_movement', 'no system provides the player movement'));
  if (movers.length > 1) issues.push(err('two_movements', `${movers.map((s) => s.id).join(' and ')} both provide the player movement`));
  const movement = movers.length === 1 ? movers[0]!.provides!.movement! : null;

  const winners = owners((s) => s.provides?.win);
  if (winners.length === 0) issues.push(err('no_win', 'no system decides how a level is won'));
  if (winners.length > 1) issues.push(err('two_wins', `${winners.map((s) => s.id).join(' and ')} both decide how a level is won`));

  const death = deathRule(systems);
  if (death.clashing.length) issues.push(err('two_death_rules', `${death.clashing.map((s) => `${s.id} (${s.provides!.death})`).join(' and ')} both decide what a death does`));
  if (!death.owner && roles.has('hostile')) issues.push(err('no_death_rule', 'hostiles can hurt the player, but no system decides what a death does (respawn or end the run)'));

  for (const s of systems) {
    const r = s.requires;
    if (r?.movement && movement && !r.movement.includes(movement)) issues.push(err('movement_mismatch', `${s.id} works with ${r.movement.join(' or ')} movement, not ${movement}`, { path: s.id }));
    for (const role of r?.roles ?? []) if (!roles.has(role)) issues.push(err('missing_role', `${s.id} needs entities that are ${role}, and the game has none`, { path: s.id }));
    for (const c of r?.content ?? []) if (!content.has(c)) issues.push(err('missing_content', `${s.id} needs content/${c}.json`, { path: s.id }));
    for (const other of r?.systems ?? []) if (!ids.has(other)) issues.push(err('missing_system', `${s.id} needs the ${other} system`, { path: s.id }));
    for (const other of s.conflicts ?? []) if (ids.has(other)) issues.push(err('conflict', `${s.id} cannot share a game with ${other}`, { path: s.id }));
  }

  const uses = new Map<string, Array<{ system: string; use: string }>>();
  for (const s of systems) for (const [key, use] of Object.entries(s.controls ?? {})) if (use) uses.set(key, [...(uses.get(key) ?? []), { system: s.id, use }]);
  for (const [key, all] of uses) {
    const own = all.filter((u) => !SHARED_USES.has(u.use));
    if (new Set(own.map((u) => u.use)).size > 1) issues.push(err('key_twice', `the ${key} key would ${own.map((u) => `${u.use} (${u.system})`).join(' and ')}`, { path: key }));
  }
  return report(issues, { systems: systems.length, movement: movement ?? 'none' });
}
