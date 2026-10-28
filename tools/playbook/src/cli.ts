import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '@gg/db';
import { extractCandidates, promote, writeCandidates } from './index.js';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    store: { type: 'string', default: process.env['GG_STORE_DIR'] ?? resolve(repoRoot, '.gg-store') },
    harness: { type: 'string', default: resolve(repoRoot, 'harness') },
    genre: { type: 'string' },
    text: { type: 'string' },
    source: { type: 'string' },
  },
});
const cmd = positionals[0];
if (cmd === 'extract') {
  const store = storeFromEnv({ ...process.env, GG_STORE_DIR: values.store });
  const candidates = await extractCandidates(store);
  const file = writeCandidates(values.harness, candidates);
  console.log(`${candidates.length} candidate(s) -> ${file}`);
  for (const c of candidates) console.log(`- ${c.id} [${c.genre}/${c.stage}] failed ${c.failedAttempts.length}x (${c.failedAttempts.flatMap((f) => f.failing.map((x) => x.name)).join(', ')}) then passed with ${c.passedAttempt.model}`);
} else if (cmd === 'promote') {
  if (!values.genre || !values.text || !values.source) throw new Error('usage: playbook promote --genre <g> --text "<lesson>" --source <jobId>/<stage>');
  console.log(`appended to ${promote(values.harness, values.genre, values.text, values.source)}`);
} else {
  console.error('usage: playbook <extract|promote> [--store DIR] [--harness DIR] [--genre G --text T --source S]');
  process.exit(2);
}
