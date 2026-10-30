import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { ARTIFACT_SCHEMAS, parseAnyGdd, parseSystemsFile, type AnyGddFrontmatter, type ArtifactName, type BehaviourFsm, type LevelJson, type SystemsFile } from '@gg/schemas';
import { CELESTE_CLASS } from '@gg/sdk';
import { checkGameSprites, manifestFor, resolveGame } from '@gg/templates/node';
import type { GenreManifest } from '@gg/template-core';
import { checkGdd, parseFrontmatter, report, validateBehaviour, validateLevel, type ValidationReport } from '@gg/validators';

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
  if (name === 'objectives.json') return 'Objectives';
  if (/\/content\/entities\.json$/.test(f)) return 'EntityRoster';
  if (/\/content\/crops\.json$/.test(f)) return 'CropTable';
  if (/\/content\/sprites\.json$/.test(f)) return 'SpriteSheet';
  if (/\/content\/proofs\/[^/]+\.json$/.test(f)) return 'LevelProof';
  if (name === 'systems.json') return 'SystemsFile';
  if (name === 'mechanics.json') return 'MechanicsFile';
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

function systemsOf(gameRoot: string): SystemsFile | null {
  try {
    return JSON.parse(readFileSync(join(gameRoot, 'design', 'systems.json'), 'utf8')) as SystemsFile;
  } catch {
    return null;
  }
}

/** The game of a game root: its curated genre, or its freeform composition (from systems.json, the roster, the GDD). */
function genreOf(gameRoot: string): GenreManifest | null {
  try {
    return resolveGame(gameRoot);
  } catch {
    return null;
  }
}

function feelFor(gameRoot: string, g: GenreManifest | null) {
  const preset = systemsOf(gameRoot)?.feelPreset;
  if (g) return (preset ? g.feelPresets[preset] : undefined) ?? g.feelPresets[g.defaultFeel] ?? CELESTE_CLASS;
  return CELESTE_CLASS;
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
    const md = readFileSync(abs, 'utf8');
    const fm = parseFrontmatter(md);
    const parsed = fm ? parseAnyGdd(fm.data) : null;
    const gdd: AnyGddFrontmatter | null = parsed?.success ? parsed.data : null;
    // A freeform game's budget is its base genre's.
    const budget = gdd ? manifestFor({ gdd }).scopeBudget[gdd.scopeTier] : undefined;
    if (!printReport(file, 'gdd', checkGdd(md, budget))) failed++;
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
  // systems.json is parsed by its genre, so a curated file fails with the curated schema's own issues.
  const result = name === 'SystemsFile' ? parseSystemsFile(data) : ARTIFACT_SCHEMAS[name].safeParse(data);
  if (!result.success) {
    failed++;
    console.error(`${file}: FAILED ${name}`);
    for (const issue of result.error.issues.slice(0, 20)) console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    continue;
  }
  const g = genreOf(gameRoot);
  if (name === 'LevelJson') {
    const level = result.data as LevelJson;
    const feel = feelFor(gameRoot, g);
    const r = g ? g.levelGrammar.validate(level, feel) : validateLevel(level, { feel });
    if (!printReport(file, `level (${g?.id ?? 'generic'})`, r)) failed++;
  } else if (name === 'BehaviourFsm') {
    if (!printReport(file, 'behaviour', validateBehaviour(result.data as BehaviourFsm, g?.behaviourVocab, g?.entityDefs.map((e) => e.type)))) failed++;
  } else if (name === 'SpriteSheet') {
    // The cast's look, held to the art rules in the game's palette (design/style.json).
    if (!printReport(file, 'sprites', checkGameSprites(gameRoot))) failed++;
  } else if (g?.designContent?.some((d) => d.artifact === name)) {
    // Content the design stage writes from the idea (a farm's crops), held to the rules the game's systems set.
    const d = g.designContent.find((x) => x.artifact === name)!;
    const systems = systemsOf(gameRoot);
    if (!systems) console.log(`${file}: OK (${name}; no design/systems.json to hold it to)`);
    else if (!printReport(file, d.key, report(d.check(result.data, systems)))) failed++;
  } else {
    console.log(`${file}: OK (${name})`);
  }
}
process.exit(failed > 0 ? 1 : 0);
