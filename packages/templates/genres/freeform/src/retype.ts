import type { Action, BehaviourFsm, EcaRule, LevelJson, Objectives, WaveTable } from '@gg/schemas';

/** Old type name to new: a roster's names for the shipped entities, or the way back. */
export type Rename = ReadonlyMap<string, string>;

const name = (rename: Rename, type: string) => rename.get(type) ?? type;

/** The rename the other way: unretype(retype(x)) is x, since a roster gives each shipped entity one name. */
export function inverse(rename: Rename): Map<string, string> {
  return new Map([...rename].map(([a, b]) => [b, a]));
}

function retypeAction(a: Action, rename: Rename): Action {
  return a.kind === 'shoot' || a.kind === 'shoot_ring' ? { ...a, projectile: name(rename, a.projectile) } : a;
}

/** A behaviour with the projectiles it fires renamed. */
export function retypeFsm(fsm: BehaviourFsm, rename: Rename): BehaviourFsm {
  const states = Object.fromEntries(
    Object.entries(fsm.states).map(([id, st]) => [id, { ...st, onEnter: st.onEnter.map((a) => retypeAction(a, rename)), update: st.update.map((a) => retypeAction(a, rename)) }]),
  );
  return { ...fsm, states };
}

/** A rule with the projectiles its actions fire renamed. */
export function retypeRule(rule: EcaRule, rename: Rename): EcaRule {
  return { ...rule, do: rule.do.map((a) => retypeAction(a, rename)) };
}

/** A level with its entities renamed. */
export function retypeLevel(level: LevelJson, rename: Rename): LevelJson {
  return { ...level, entities: level.entities.map((e) => ({ ...e, type: name(rename, e.type) })) };
}

/** A wave table with the enemies it sends renamed. */
export function retypeWaves(table: WaveTable, rename: Rename): WaveTable {
  return { ...table, waves: table.waves.map((w) => ({ ...w, spawns: w.spawns.map((s) => ({ ...s, enemy: name(rename, s.enemy) })) })) };
}

/** Objectives with the types their clauses count renamed. */
export function retypeObjectives(o: Objectives, rename: Rename): Objectives {
  const clauses = o.win.clauses.map((c) => ((c.kind === 'defeat' || c.kind === 'collect') && c.type !== undefined ? { ...c, type: name(rename, c.type) } : c));
  return { ...o, win: { ...o.win, clauses } };
}

/** Content files by key, the types they name renamed (the waves, the objectives); the rest name none. */
export function retypeContent(content: Readonly<Record<string, unknown>>, rename: Rename): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content };
  if (content['waves']) out['waves'] = retypeWaves(content['waves'] as WaveTable, rename);
  if (content['objectives']) out['objectives'] = retypeObjectives(content['objectives'] as Objectives, rename);
  return out;
}

/** The events a behaviour emits (a boss's slam, its enrage). */
export function emitsOf(fsm: BehaviourFsm): string[] {
  const out = new Set<string>();
  for (const st of Object.values(fsm.states)) for (const a of [...st.onEnter, ...st.update]) if (a.kind === 'emit') out.add(a.event);
  return [...out];
}

/** The projectile types a behaviour fires. */
export function projectilesOf(fsm: BehaviourFsm | null): string[] {
  const out = new Set<string>();
  for (const st of Object.values(fsm?.states ?? {})) for (const a of [...st.onEnter, ...st.update]) if (a.kind === 'shoot' || a.kind === 'shoot_ring') out.add(a.projectile);
  return [...out];
}
