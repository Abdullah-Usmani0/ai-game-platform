import type { BehaviourFsm, EcaRule } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

export interface BehaviourVocabulary {
  conditions: string[];
  actions: string[];
}

/** Structural checks beyond the schema: reachability of states, dead transitions, vocabulary subset. */
export function validateBehaviour(fsm: BehaviourFsm, vocab?: BehaviourVocabulary): ValidationReport {
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
    if (vocab) {
      for (const a of [...s.onEnter, ...s.update]) if (!vocab.actions.includes(a.kind)) issues.push(err('action_not_in_vocab', `action '${a.kind}' is not in this genre's vocabulary`, { path: `states.${n}` }));
      for (const t of s.transitions) {
        const kinds = t.when.kind === 'all' || t.when.kind === 'any' ? t.when.of.map((c) => c.kind) : [t.when.kind];
        for (const k of kinds) if (!vocab.conditions.includes(k)) issues.push(err('condition_not_in_vocab', `condition '${k}' is not in this genre's vocabulary`, { path: `states.${n}.transitions` }));
      }
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
