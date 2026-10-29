import { parseAnyGdd } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

const REQUIRED_SECTIONS = ['Concept', 'Pillars', 'Core loop', 'Progression', 'Scope', 'Feedback'];

/** Parse YAML-ish front matter (flat keys, JSON values) and check required sections. */
export function parseFrontmatter(md: string): { data: unknown; body: string } | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
  if (!m) return null;
  const raw = m[1] ?? '';
  try {
    return { data: JSON.parse(raw), body: m[2] ?? '' };
  } catch {
    // Minimal YAML: key: value per line, values as JSON when possible.
    const obj: Record<string, unknown> = {};
    for (const line of raw.split('\n')) {
      const kv = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(line);
      if (!kv) continue;
      const [, k, v] = kv;
      try {
        obj[k!] = JSON.parse(v ?? '');
      } catch {
        obj[k!] = v;
      }
    }
    return { data: obj, body: m[2] ?? '' };
  }
}

export function checkGdd(md: string, scopeBudget?: { levels: number; enemies: number; items: number; bosses: number }): ValidationReport {
  const issues: Issue[] = [];
  const fm = parseFrontmatter(md);
  if (!fm) return report([err('no_frontmatter', 'gdd.md must start with a front matter block')]);
  const parsed = parseAnyGdd(fm.data);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push(err('frontmatter_invalid', `${i.path.join('.') || '(root)'}: ${i.message}`, { path: i.path.join('.') }));
    return report(issues);
  }
  const g = parsed.data;
  for (const s of REQUIRED_SECTIONS) if (!new RegExp(`^##\\s+${s}`, 'mi').test(fm.body)) issues.push(err('section_missing', `missing section '## ${s}'`));
  if (scopeBudget) {
    for (const k of ['levels', 'enemies', 'items', 'bosses'] as const) if (g.scope[k] > scopeBudget[k]) issues.push(err('scope_over_budget', `scope.${k} ${g.scope[k]} exceeds the tier budget ${scopeBudget[k]}`));
  }
  const verbs = new Set(g.verbs.map((v) => v.toLowerCase()));
  const ATTACK_VERBS = ['attack', 'stomp', 'shoot', 'hit', 'melee', 'strike', 'slash', 'punch'];
  for (const fe of g.feedbackEvents) {
    if (fe.event === 'hit' && !ATTACK_VERBS.some((v) => verbs.has(v))) issues.push(warn('feedback_without_verb', `feedback event 'hit' has no attack verb`));
    else if ((fe.event === 'jump' || fe.event === 'dash') && !verbs.has(fe.event)) issues.push(warn('feedback_without_verb', `feedback event '${fe.event}' has no matching verb`));
  }
  if (fm.body.length < 400) issues.push(warn('gdd_too_short', 'the GDD body is under 400 characters'));
  return report(issues, { pillars: g.pillars.length, verbs: g.verbs.length, feedbackEvents: g.feedbackEvents.length });
}
