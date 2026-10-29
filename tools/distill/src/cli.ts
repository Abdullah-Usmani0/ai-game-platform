import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '@gg/db';
import { DEFAULT_HOLDOUT, exportDatasets, READY_PAIRS, stageStatus } from './index.js';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
// pnpm runs the script in the package directory; relative paths are the caller's.
const cwd = process.env['INIT_CWD'] ?? process.cwd();
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    store: { type: 'string', default: process.env['GG_STORE_DIR'] ?? resolve(repoRoot, '.gg-store') },
    out: { type: 'string', default: resolve(repoRoot, '.gg-distill') },
    stage: { type: 'string', multiple: true },
    holdout: { type: 'string', default: String(DEFAULT_HOLDOUT) },
    'new-only': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});
const store = storeFromEnv({ ...process.env, GG_STORE_DIR: resolve(cwd, values.store) });
const cmd = positionals[0];
if (cmd === 'status') {
  const rows = await stageStatus(store);
  if (rows.length === 0) console.log('no training pairs recorded yet (dry runs and the fake provider record none)');
  for (const r of rows) console.log(`${r.stage.padEnd(12)} ${String(r.uniqueInputs).padStart(6)} unique of ${r.pairs} pairs, ${r.notExported} not exported, ${r.moderated} from moderated games; ${r.ready ? 'ready' : `${READY_PAIRS - r.uniqueInputs} more for a LoRA run`}`);
} else if (cmd === 'export') {
  const outDir = resolve(cwd, values.out);
  const manifests = await exportDatasets(store, { outDir, stages: values.stage, holdout: Number(values.holdout), newOnly: values['new-only'], dryRun: values['dry-run'] });
  for (const m of manifests) {
    const x = m.excluded;
    console.log(`${m.stage}: ${m.files.train.examples} train / ${m.files.holdout.examples} holdout -> ${resolve(outDir, m.stage)} (left out: ${x.duplicate} duplicate, ${x.moderated} moderated, ${x.exportedBefore} exported before)`);
  }
  if (values['dry-run']) console.log('dry run: no pair was stamped as exported');
  console.log('exports hold user prompts: keep them out of git and delete them once the training job has them');
} else {
  console.error('usage: distill <status|export> [--store DIR] [--out DIR] [--stage S]... [--holdout 0.1] [--new-only] [--dry-run]');
  process.exit(2);
}
