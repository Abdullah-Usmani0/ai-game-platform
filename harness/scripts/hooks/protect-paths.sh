#!/usr/bin/env bash
# PreToolUse for Edit|Write|MultiEdit: block protected paths and anything outside stage.json.allowedWrite.
set -u
cd "$(dirname "$0")/../.." || exit 0
input=$(cat)
node - "$input" <<'NODE'
const fs = require('fs');
const path = require('path');
const payload = JSON.parse(process.argv[2] || '{}');
const target = payload.tool_input?.file_path || payload.tool_input?.path || '';
if (!target) process.exit(0);
const rel = path.relative(process.cwd(), path.resolve(target)).replace(/\\/g, '/');
const protectedPatterns = [/^\.claude\//, /^\.agents\//, /(^|\/)node_modules\//, /^game\/src\/engine\//, /^game\/provenance\.json$/, /^game\/reports\//, /^stage\.json$/, /^scripts\//, /^AGENTS\.md$/, /^CLAUDE\.md$/, /^\.\./];
for (const p of protectedPatterns) {
  if (p.test(rel)) {
    console.error(`Blocked: '${rel}' is protected. Change behaviour through game/src/systems, game/content or game/design instead.`);
    process.exit(2);
  }
}
let allowed = [];
try { allowed = JSON.parse(fs.readFileSync('stage.json', 'utf8')).allowedWrite || []; } catch {}
if (allowed.length > 0) {
  const ok = allowed.some((glob) => {
    const re = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(.*/)?').replace(/\u0001/g, '.*') + '$');
    return re.test(rel);
  });
  if (!ok) {
    console.error(`Blocked: '${rel}' is outside this stage's write scope (${allowed.join(', ')}).`);
    process.exit(2);
  }
}
NODE
