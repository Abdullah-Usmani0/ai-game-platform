import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { ARTIFACT_SCHEMAS, type ArtifactName, type BehaviourFsm, type LevelJson, type SystemsJson } from '@gg/schemas';
import { CELESTE_CLASS, FEEL_PRESETS } from '@gg/sdk';
import { checkGdd, validateBehaviour, validateLevel, type ValidationReport } from '@gg/validators';

/**
 * Picks the schema for a design/content artifact by its path, validates it, then runs the semantic
 * validator for that artifact (level solver, behaviour structure, GDD sections). Exit 1 with issues on failure.
 */
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

/** Find the game root (the directory holding design/ and content/) above a file. */
function gameRootOf(file: string): string {
  let dir = dirname(file);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'design')) || existsSync(join(dir, 'content'))) return dir;
    dir = dirname(dir);
  }
  return dirname(file);
}

function feelFor(gameRoot: string) {
  try {
    const systems = JSON.parse(readFileSync(join(gameRoot, 'design', 'systems.json'), 'utf8')) as SystemsJson;
    return FEEL_PRESETS[systems.feelPreset] ?? CELESTE_CLASS;
  } catch {
    return CELESTE_CLASS;
  }
}

function printReport(file: string, label: string, r: ValidationReport): boolean {
  const errors = r.issues.filter((i) => i.severity === 'error');
  const warnings = r.issues.filter((i) => i.severity === 'warning');
  console.log(`${file}: ${r.ok ? 'OK' : 'FAILED'} ${label} ${JSON.stringify(r.metrics)}`);
  for (const i of errors) console.error(`  - error ${i.code}: ${i.message}`);
  for (const i of warnings) console.log(`  - warning ${i.code}: ${i.message}`);
  return r.ok;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: validate-artifact <file.json|gdd.md> [...]');
  process.exit(2);
}
let failed = 0;
for (const file of files) {
  const abs = resolve(file);
  const gameRoot = gameRootOf(abs);
  if (basename(abs) === 'gdd.md') {
    if (!printReport(file, 'gdd', checkGdd(readFileSync(abs, 'utf8')))) failed++;
    continue;
  }
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
  if (!result.success) {
    failed++;
    console.error(`${file}: FAILED ${name}`);
    for (const issue of result.error.issues.slice(0, 20)) console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    continue;
  }
  if (name === 'LevelJson') {
    if (!printReport(file, 'level', validateLevel(result.data as LevelJson, { feel: feelFor(gameRoot) }))) failed++;
  } else if (name === 'BehaviourFsm') {
    if (!printReport(file, 'behaviour', validateBehaviour(result.data as BehaviourFsm))) failed++;
  } else {
    console.log(`${file}: OK (${name})`);
  }
}
process.exit(failed > 0 ? 1 : 0);
