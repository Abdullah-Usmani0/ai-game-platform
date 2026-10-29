import type { Objectives } from '@gg/schemas';
import { err, report, type Issue, type ValidationReport } from './report.js';
import type { EntityRole } from './systems.js';

/** What objectives are checked against: the roles the game's types fill, and whether its levels have a goal tile. */
export interface ObjectivesContext {
  roles: ReadonlyMap<string, ReadonlySet<EntityRole>>;
  /** The level grammar places a goal tile (tilemaps, rooms); an arena's goal is its spawn. */
  goal: boolean;
}

/**
 * Whether a game's objectives can mean what they say: the types they count exist and fill the role the clause needs
 * (only hostiles are defeated, only collectibles collected), a goal clause has a goal to reach, and a survival clock
 * comes with a lives rule (else dying costs nothing, and standing still survives).
 */
export function checkObjectives(o: Objectives, ctx: ObjectivesContext): ValidationReport {
  const issues: Issue[] = [];
  const has = (type: string, role: EntityRole) => ctx.roles.get(type)?.has(role) ?? false;
  const any = (role: EntityRole) => [...ctx.roles.values()].some((r) => r.has(role));
  for (const [i, c] of o.win.clauses.entries()) {
    const path = `win.clauses.${i}`;
    if (c.kind === 'defeat') {
      if (c.type !== undefined && !has(c.type, 'hostile')) issues.push(err('objective_type', `defeat counts '${c.type}', which is not a hostile type of the game`, { path }));
      if (c.type === undefined && !any('hostile')) issues.push(err('objective_type', 'defeat counts hostiles, and the game has none', { path }));
    }
    if (c.kind === 'collect') {
      if (c.type !== undefined && !has(c.type, 'collectible')) issues.push(err('objective_type', `collect counts '${c.type}', which is not a collectible type of the game`, { path }));
      if (c.type === undefined && !any('collectible')) issues.push(err('objective_type', 'collect counts pickups, and the game has none', { path }));
    }
    if (c.kind === 'reach_goal' && !ctx.goal) issues.push(err('no_goal', "reach_goal needs levels with a goal tile; this game's levels have none", { path }));
    if (c.kind === 'survive' && !o.lose.some((l) => l.kind === 'lives')) issues.push(err('free_deaths', 'a survival clock needs a lives rule: without one dying costs nothing', { path }));
  }
  return report(issues, { clauses: o.win.clauses.length });
}
