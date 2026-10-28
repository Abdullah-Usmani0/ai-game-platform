/**
 * The harness guards as code, for runners that do not get Claude Code's hooks: the same protected paths
 * and write scope as scripts/hooks/protect-paths.sh and the same command rules as guard-bash.sh plus the
 * settings.json allow list. The worker-owned gate still decides; these only keep a session inside its lane.
 */
export const PROTECTED_PATHS: readonly RegExp[] = [/^\.claude\//, /^\.agents\//, /(^|\/)node_modules\//, /^game\/src\/engine\//, /^game\/provenance\.json$/, /^game\/reports\//, /^stage\.json$/, /^scripts\//, /^AGENTS\.md$/, /^CLAUDE\.md$/, /^\.\.(\/|$)/, /^\//];

export function globToRegExp(glob: string): RegExp {
  // Placeholders keep the `**` expansions from being re-expanded by the single-star pass.
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .split('**/')
    .join('__GLOBSTAR_SLASH__')
    .split('**')
    .join('__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .split('__GLOBSTAR_SLASH__')
    .join('(.*/)?')
    .split('__GLOBSTAR__')
    .join('.*');
  return new RegExp(`^${re}$`);
}

export function writeDecision(rel: string, allowedWrite: readonly string[]): { ok: boolean; reason?: string } {
  const r = rel.replace(/\\/g, '/');
  for (const p of PROTECTED_PATHS) if (p.test(r)) return { ok: false, reason: `'${r}' is protected; change behaviour through game/src/systems, game/content or game/design` };
  if (allowedWrite.length > 0 && !allowedWrite.some((g) => globToRegExp(g).test(r))) return { ok: false, reason: `'${r}' is outside this stage's write scope (${allowedWrite.join(', ')})` };
  return { ok: true };
}

export function readDecision(rel: string): { ok: boolean; reason?: string } {
  const r = rel.replace(/\\/g, '/');
  if (/^\.\.(\/|$)/.test(r) || r.startsWith('/')) return { ok: false, reason: 'reads stay inside the harness directory' };
  if (/(^|\/)node_modules\//.test(r) && !/(^|\/)node_modules\/@gg\//.test(r)) return { ok: false, reason: 'only the @gg packages under node_modules may be read' };
  return { ok: true };
}

const DENY = /(^|[;&| ])(curl|wget|ssh|scp|sudo|npm (i|install|add)|pnpm (add|install|i)\b|git push|rm -rf +\/|chmod -R)/;
const ALLOW: readonly RegExp[] = [
  /^pnpm gate$/,
  /^pnpm validate( [\w./-]+)+$/,
  /^pnpm -C game (typecheck|lint|test|build)$/,
  /^pnpm -C game exec vitest run( [\w./-]+)*$/,
  /^pnpm exec gg-bots (smoke|contact-sheet) [\w./-]+( --[a-z-]+( [\w./-]+)?)*$/,
  /^pnpm catalog [a-z-]+$/,
  /^node --import tsx \.agents\/skills\/[a-z-]+\/scripts\/[a-z-]+\.ts( [^;&|`$<>]+)?$/,
  /^(ls|cat|head|tail|wc|grep|rg|find|diff)( [^;&|`$<>]+)?$/,
];

/** Commands run one at a time; each must match the allow list and never the deny list. */
export function bashDecision(command: string): { ok: boolean; reason?: string } {
  const cmd = command.trim();
  if (!cmd) return { ok: false, reason: 'empty command' };
  if (DENY.test(cmd)) return { ok: false, reason: 'network, package installation, destructive or privileged commands are not allowed' };
  if (/[;&|`$]/.test(cmd) && !/^(grep|rg|find|diff|cat|head|tail|wc|ls)/.test(cmd)) return { ok: false, reason: 'run one command at a time (no chaining or substitution)' };
  if (!ALLOW.some((re) => re.test(cmd))) return { ok: false, reason: `'${cmd.split(' ').slice(0, 3).join(' ')}' is not an allowed command; use pnpm gate, pnpm validate, pnpm -C game <script>, gg-bots, pnpm catalog or the skill scripts` };
  return { ok: true };
}
