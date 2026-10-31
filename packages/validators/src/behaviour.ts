import { moveLength, type Action, type BehaviourFsm, type Condition, type EcaRule, type FsmState, type Move } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

export interface BehaviourVocabulary {
  conditions: string[];
  actions: string[];
}

/** Animations the player reads as a wind-up: the renderer flashes the entity while it plays one ('charge' and 'shoot' are their aliases). */
const WINDUP_ANIMS = new Set(['windup', 'aim', 'charge', 'shoot']);
/** The shortest wind-up an instant hit may follow, in ms: long enough to see it coming and step away. */
export const MIN_WINDUP_MS = 150;

const windsUp = (s: FsmState) => s.onEnter.some((a) => a.kind === 'play_anim' && WINDUP_ANIMS.has(a.anim));
/** Whether a transition only fires after the state has lasted `ms` (every way it can fire waits that long). */
function waits(c: Condition, ms: number): boolean {
  if (c.kind === 'timer_elapsed') return c.ms >= ms;
  if (c.kind === 'all') return c.of.some((x) => x.kind === 'timer_elapsed' && x.ms >= ms);
  if (c.kind === 'any') return c.of.every((x) => x.kind === 'timer_elapsed' && x.ms >= ms);
  return false;
}

/** Whether a transition can fire before `ms` have passed for any reason but a hit (which may break a move off). */
function leavesEarly(c: Condition, ms: number): boolean {
  if (c.kind === 'took_damage') return false;
  if (c.kind === 'timer_elapsed') return c.ms < ms;
  if (c.kind === 'all') return !c.of.some((x) => x.kind === 'took_damage' || (x.kind === 'timer_elapsed' && x.ms >= ms));
  if (c.kind === 'any') return c.of.some((x) => x.kind !== 'took_damage' && !(x.kind === 'timer_elapsed' && x.ms >= ms));
  return true;
}

/** An action that moves the body on its own each tick it runs (turning to face the player at speed 0 does not). */
function moves(a: Action): boolean {
  switch (a.kind) {
    case 'patrol':
    case 'jump':
      return true;
    case 'move_toward_player':
    case 'move_away_from_player':
      return a.speed > 0;
    case 'set_velocity':
      return a.vx !== 0 || a.vy !== 0;
    default:
      return false;
  }
}

/**
 * Structural checks beyond the schema: reachability of states, dead transitions, vocabulary subset, a readable wind-up
 * before every hit that lands at once (damage_player: never at spawn, entered only from a state that plays a wind-up
 * animation and waits MIN_WINDUP_MS or more; a shot needs none, it is dodged in flight), and, given the game's entity
 * types, that every projectile it fires is one of them (a shot of a type the game lacks stops the sim).
 * Given the moves of the entities that run it (a castle's claws and pounces), a state that plays a move's clip makes the
 * move: it may not move the body itself (the move carries it), and it waits the move out before it leaves, a hit aside.
 */
export function validateBehaviour(fsm: BehaviourFsm, vocab?: BehaviourVocabulary, types?: readonly string[], ownMoves?: readonly Move[]): ValidationReport {
  const issues: Issue[] = [];
  const names = Object.keys(fsm.states);
  const reachable = new Set<string>([fsm.initial]);
  const queue = [fsm.initial];
  while (queue.length > 0) {
    const s = fsm.states[queue.shift()!];
    if (!s) continue;
    for (const t of s.transitions) if (!reachable.has(t.to)) { reachable.add(t.to); queue.push(t.to); }
  }
  for (const n of names) if (!reachable.has(n)) issues.push(warn('state_unreachable', `state '${n}' is never entered`, { path: `states.${n}` }));
  for (const [n, s] of Object.entries(fsm.states)) {
    const seenAlways = s.transitions.findIndex((t) => t.when.kind === 'always');
    if (seenAlways >= 0 && seenAlways < s.transitions.length - 1) issues.push(warn('dead_transition', `state '${n}': transitions after an 'always' are dead`, { path: `states.${n}.transitions` }));
    if (s.update.length === 0 && s.onEnter.length === 0 && s.transitions.length === 0) issues.push(err('empty_state', `state '${n}' does nothing and never leaves`, { path: `states.${n}` }));
    if (s.transitions.length === 0 && names.length > 1) issues.push(warn('terminal_state', `state '${n}' never transitions out`, { path: `states.${n}` }));
    if (types) {
      for (const a of [...s.onEnter, ...s.update]) {
        if ((a.kind === 'shoot' || a.kind === 'shoot_ring') && !types.includes(a.projectile)) issues.push(err('unknown_projectile', `state '${n}' fires '${a.projectile}', which this game has no entity type for`, { path: `states.${n}` }));
      }
    }
    if (vocab) {
      for (const a of [...s.onEnter, ...s.update]) if (!vocab.actions.includes(a.kind)) issues.push(err('action_not_in_vocab', `action '${a.kind}' is not in this genre's vocabulary`, { path: `states.${n}` }));
      for (const t of s.transitions) {
        const kinds = t.when.kind === 'all' || t.when.kind === 'any' ? t.when.of.map((c) => c.kind) : [t.when.kind];
        for (const k of kinds) if (!vocab.conditions.includes(k)) issues.push(err('condition_not_in_vocab', `condition '${k}' is not in this genre's vocabulary`, { path: `states.${n}.transitions` }));
      }
    }
  }
  for (const [n, s] of Object.entries(fsm.states)) {
    if (![...s.onEnter, ...s.update].some((a) => a.kind === 'damage_player')) continue;
    const at = { path: `states.${n}` };
    if (n === fsm.initial) issues.push(err('hit_unannounced', `state '${n}' hurts the player the moment the entity appears: start it in a state that winds up first`, at));
    for (const [m, from] of Object.entries(fsm.states)) {
      if (m === n) continue;
      for (const t of from.transitions) {
        if (t.to !== n || (windsUp(from) && waits(t.when, MIN_WINDUP_MS))) continue;
        const why = windsUp(from) ? `before ${MIN_WINDUP_MS} ms of its wind-up have passed` : 'with no wind-up';
        issues.push(err('hit_unannounced', `state '${n}' hurts the player at once and is entered from '${m}' ${why}: go through a state that plays 'windup' and leaves on timer_elapsed of ${MIN_WINDUP_MS} ms or more`, at));
      }
    }
  }
  for (const [n, st] of Object.entries(fsm.states)) {
    const played = st.onEnter.flatMap((a) => (a.kind === 'play_anim' ? [a.anim] : []));
    const m = ownMoves?.find((x) => played.includes(x.anim));
    if (!m) continue;
    const at = { path: `states.${n}` };
    if (st.update.some(moves)) issues.push(err('move_state_moves', `state '${n}' makes the move '${m.id}' and moves the body itself as well: the move carries it, so its update moves nothing`, at));
    // One tick after the state is entered the move starts; it is over its length later.
    const ms = Math.ceil(((moveLength(m) + 1) * 1000) / 60);
    for (const t of st.transitions) {
      if (leavesEarly(t.when, ms)) issues.push(err('move_cut_short', `state '${n}' can leave for '${t.to}' before its move '${m.id}' is over: wait with timer_elapsed of ${ms} ms or more (or leave on took_damage)`, at));
    }
  }
  return report(issues, { states: names.length, reachable: reachable.size });
}

export function validateRules(rules: EcaRule[], knownEvents: string[]): ValidationReport {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) issues.push(err('duplicate_rule', `rule id '${r.id}' is duplicated`, { path: r.id }));
    ids.add(r.id);
    if (!knownEvents.includes(r.on) && !r.on.startsWith('custom:')) issues.push(warn('unknown_event', `rule '${r.id}' listens to unknown event '${r.on}'`, { path: r.id }));
  }
  return report(issues, { rules: rules.length });
}
