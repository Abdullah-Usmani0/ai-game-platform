import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ARTIFACT_SCHEMAS, type ArtifactName } from '@gg/schemas';

/** Picks the schema for a design/content artifact by its path and validates it. Exit 1 with issues on failure. */
function schemaFor(file: string): ArtifactName | null {
  const f = file.replace(/\\/g, '/');
  const name = basename(f);
  if (/\/content\/levels\/[^/]+\.json$/.test(f)) return 'LevelJson';
  if (/\/content\/behaviour\/[^/]+\.fsm\.json$/.test(f)) return 'BehaviourFsm';
  if (/\/content\/rules\/[^/]+\.eca\.json$/.test(f)) return 'EcaRule';
  if (name === 'waves.json') return 'WaveTable';
  if (name === 'systems.json') return 'SystemsJson';
  if (name === 'style.json') return 'StyleCard';
  if (name === 'playtest-report.json') return 'PlaytestReport';
  if (name === 'manifest.json' && /\/dist\//.test(f)) return 'BundleManifest';
  return null;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: validate-artifact <file.json> [...]');
  process.exit(2);
}
let failed = 0;
for (const file of files) {
  const abs = resolve(file);
  const name = schemaFor(abs);
  if (!name) {
    console.log(`${file}: no schema for this path (skipped)`);
    continue;
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`${file}: invalid JSON: ${(e as Error).message}`);
    failed++;
    continue;
  }
  const result = ARTIFACT_SCHEMAS[name].safeParse(data);
  if (result.success) {
    console.log(`${file}: OK (${name})`);
  } else {
    failed++;
    console.error(`${file}: FAILED ${name}`);
    for (const issue of result.error.issues.slice(0, 20)) console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
