import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { mergeReports, runSmoke } from '@gg/bots';
import { LevelJson, Objectives, parseAnyGdd, parseSystemsFile, StyleCard, type AnyGddFrontmatter, type GateReport, type PlaytestReport } from '@gg/schemas';
import { catalogFor, manifestFor, readGameFiles, rolesPresent } from '@gg/templates/node';
import { checkFreeformObjectives } from '@gg/template-freeform/node';
import { sfxPresetFor } from '@gg/sdk/art';
import { checkComposition, checkGdd, checkSystems, juiceLintRuns, parseFrontmatter, silentSfx, validateRamp, type FeedbackTable, type Issue } from '@gg/validators';

/**
 * `pnpm gate`: the deterministic definition of done for the current stage.
 * Reads stage.json, runs each named check against ./game, writes game/reports/gate-<stage>.json,
 * exits 0 on pass and 2 on failure. Flags `stalled` when the failure signature repeats.
 */
interface StageFile {
  stage: string;
  attempt?: number;
  gate: string[];
  seeds?: number[];
  ticks?: number;
}

const harnessDir = resolve(process.cwd());
const gameDir = resolve(harnessDir, process.env['GG_GAME_DIR'] ?? 'game');
const reportsDir = join(gameDir, 'reports');
const stage: StageFile = JSON.parse(readFileSync(join(harnessDir, 'stage.json'), 'utf8'));
const budgets = JSON.parse(readFileSync(join(harnessDir, 'budgets.json'), 'utf8')) as Record<string, number>;

type Check = GateReport['checks'][number];

function run(cmd: string, args: string[], cwd: string): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 16 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, out };
}

function readGdd(): AnyGddFrontmatter | null {
  const gddPath = join(gameDir, 'design', 'gdd.md');
  if (!existsSync(gddPath)) return null;
  const fm = parseFrontmatter(readFileSync(gddPath, 'utf8'));
  const parsed = fm ? parseAnyGdd(fm.data) : null;
  return parsed?.success ? parsed.data : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Each smoke seed's own report (playtest-seed<N>.json): the event history the juice lint needs, run by run. */
const SEED_REPORT = /^playtest-seed(\d+)\.json$/;
function seedReports(): PlaytestReport[] {
  if (!existsSync(reportsDir)) return [];
  return readdirSync(reportsDir)
    .filter((f) => SEED_REPORT.test(f))
    .sort((a, b) => Number(SEED_REPORT.exec(a)![1]) - Number(SEED_REPORT.exec(b)![1]))
    .map((f) => readJson<PlaytestReport>(join(reportsDir, f)));
}

/** What must answer what: design/feedback.json (the GDD's table plus the genre's custom events), else the GDD's table. */
function feedbackTable(): FeedbackTable | null {
  const p = join(gameDir, 'design', 'feedback.json');
  if (existsSync(p)) return { feedbackEvents: readJson<Array<{ event: string; channels: string[] }>>(p) };
  const fm = readGdd();
  return fm ? { feedbackEvents: fm.feedbackEvents } : null;
}

function tail(text: string, lines = 30): string {
  const arr = text.trim().split('\n');
  return arr.slice(-lines).join('\n');
}

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? dirBytes(p) : st.size;
  }
  return total;
}

async function check(name: string): Promise<Check> {
  switch (name) {
    case 'typecheck':
    case 'lint':
    case 'test':
    case 'build': {
      const r = run('pnpm', ['-C', gameDir, 'run', name], harnessDir);
      return { name, passed: r.ok, detail: r.ok ? '' : tail(r.out) };
    }
    case 'validate:levels':
    case 'validate:behaviour': {
      const sub = name === 'validate:levels' ? join(gameDir, 'content', 'levels') : join(gameDir, 'content', 'behaviour');
      if (!existsSync(sub)) return { name, passed: true, detail: 'no files' };
      const files = readdirSync(sub).filter((f) => f.endsWith('.json')).map((f) => join(sub, f));
      if (files.length === 0) return { name, passed: true, detail: 'no files' };
      const r = run('pnpm', ['validate', ...files], harnessDir);
      return { name, passed: r.ok, detail: r.ok ? '' : tail(r.out) };
    }
    case 'validate:gdd': {
      const gddPath = join(gameDir, 'design', 'gdd.md');
      if (!existsSync(gddPath)) return { name, passed: false, detail: 'design/gdd.md missing' };
      const md = readFileSync(gddPath, 'utf8');
      const fm = readGdd();
      // A freeform game's budget is its base genre's.
      const budget = fm ? manifestFor({ gdd: fm }).scopeBudget[fm.scopeTier] : undefined;
      const r = checkGdd(md, budget);
      const issues = [...r.issues, ...(fm ? silentSfx(fm, sfxPresetFor) : [])];
      return { name, passed: issues.every((i) => i.severity !== 'error'), detail: issues.map((i) => `${i.severity} ${i.code}: ${i.message}`).join('\n') };
    }
    case 'validate:style': {
      const p = join(gameDir, 'design', 'style.json');
      if (!existsSync(p)) return { name, passed: false, detail: 'design/style.json missing' };
      const r = StyleCard.safeParse(readJson(p));
      return { name, passed: r.success, detail: r.success ? '' : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') };
    }
    case 'validate:systems': {
      const p = join(gameDir, 'design', 'systems.json');
      if (!existsSync(p)) return { name, passed: false, detail: 'design/systems.json missing' };
      const parsed = parseSystemsFile(readJson(p));
      if (!parsed.success) return { name, passed: false, detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') };
      const issues: Issue[] = [...checkSystems(parsed.data, catalogFor(parsed.data), readGdd() ?? undefined).issues];
      if (parsed.data.genre === 'freeform') {
        // A freeform game is held together by the composition rules, over the roster's roles and the content it ships.
        const files = readGameFiles(gameDir);
        const m = manifestFor(files);
        const content = existsSync(join(gameDir, 'content')) ? readdirSync(join(gameDir, 'content')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : [];
        issues.push(...checkComposition(Object.values(m.systems).map((s) => s.meta), { roles: rolesPresent(m), content }).issues);
        const objectivesPath = join(gameDir, 'content', 'objectives.json');
        if (existsSync(objectivesPath) && files.roster) {
          const o = Objectives.safeParse(readJson(objectivesPath));
          if (o.success) issues.push(...checkFreeformObjectives(parsed.data, files.roster, o.data).issues);
          else issues.push(...o.error.issues.map((i) => ({ code: 'objectives_invalid', message: `content/objectives.json ${i.path.join('.')}: ${i.message}`, severity: 'error' as const })));
        }
      }
      const passed = issues.every((i) => i.severity !== 'error');
      return { name, passed, detail: issues.map((i) => `${i.severity} ${i.code}: ${i.message}`).join('\n') };
    }
    case 'validate:ramp': {
      const dir = join(gameDir, 'content', 'levels');
      if (!existsSync(dir)) return { name, passed: false, detail: 'content/levels missing' };
      const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      const levels = files.map((f) => {
        const l = LevelJson.parse(readJson(join(dir, f)));
        return { id: l.id, difficulty: l.ramp?.difficulty ?? 0 };
      });
      const r = validateRamp(levels);
      const problems = r.issues.filter((i) => i.severity === 'error').map((i) => `${i.code}: ${i.message}`);
      const gdd = readGdd();
      if (gdd && levels.length !== gdd.scope.levels) problems.push(`level count ${levels.length} != GDD scope ${gdd.scope.levels}`);
      return { name, passed: problems.length === 0, detail: problems.join('\n') };
    }
    case 'validate:assets': {
      const reqPath = join(gameDir, 'assets', 'requests.json');
      const manPath = join(gameDir, 'assets', 'manifest.json');
      const requests = existsSync(reqPath) ? (readJson<{ requests?: Array<{ key: string }> }>(reqPath).requests ?? []) : [];
      const assets = existsSync(manPath) ? (readJson<{ assets?: Array<{ key: string }> }>(manPath).assets ?? []) : [];
      const have = new Set(assets.map((a) => a.key));
      const missing = requests.filter((r) => !have.has(r.key)).map((r) => r.key);
      return { name, passed: missing.length === 0, detail: missing.length ? `requested assets without a manifest entry: ${missing.join(', ')}` : '' };
    }
    case 'solver': {
      // The scaffolded game's own solver test: every level completed by the genre's solver bot, with bespoke systems included.
      const testFile = join(gameDir, 'tests', 'unit', 'game.test.ts');
      const r = existsSync(testFile) ? run('pnpm', ['-C', gameDir, 'exec', 'vitest', 'run', 'tests/unit/game.test.ts'], harnessDir) : run('pnpm', ['-C', gameDir, 'run', 'test'], harnessDir);
      return { name, passed: r.ok, detail: r.ok ? '' : tail(r.out) };
    }
    case 'review': {
      const p = join(reportsDir, 'review.json');
      if (!existsSync(p)) return { name, passed: true, detail: 'no review report (reviewer did not run)' };
      const rev = readJson<{ findings?: Array<{ severity?: string; file?: string; note?: string }> }>(p);
      const p0 = (rev.findings ?? []).filter((f) => f.severity === 'P0');
      return { name, passed: p0.length === 0, detail: p0.map((f) => `P0 ${f.file ?? ''}: ${f.note ?? ''}`).join('\n') };
    }
    case 'juice': {
      const reportPath = join(reportsDir, 'playtest-report.json');
      const runs = seedReports();
      if (runs.length === 0 && existsSync(reportPath)) runs.push(readJson<PlaytestReport>(reportPath));
      if (runs.length === 0) return { name, passed: false, detail: 'no playtest report; run the smoke check first' };
      const table: FeedbackTable = feedbackTable() ?? { feedbackEvents: [{ event: 'hit', channels: ['shake', 'flash', 'sfx'] }, { event: 'death', channels: ['flash', 'sfx'] }, { event: 'pickup', channels: ['sfx'] }] };
      const r = juiceLintRuns(runs.map((rep) => ({ seed: rep.seeds[0] ?? 1, events: rep.events ?? [] })), table);
      const issues = [...silentSfx(table, sfxPresetFor), ...r.issues];
      const errors = issues.filter((i) => i.severity === 'error').map((i) => `${i.code}: ${i.message}`);
      const warnings = issues.filter((i) => i.severity === 'warning').map((i) => `${i.code}: ${i.message}`);
      return { name, passed: errors.length === 0, detail: [...errors, ...warnings.map((w) => `warning ${w}`)].join('\n') };
    }
    case 'smoke': {
      const dist = join(gameDir, 'dist');
      if (!existsSync(join(dist, 'index.html'))) return { name, passed: false, detail: `no bundle at ${dist}; run build first` };
      const seeds = stage.seeds ?? [1];
      const failures: string[] = [];
      // Each seed writes its own report; the summary (playtest-report.json) is merged from this run's seeds only.
      if (existsSync(reportsDir)) for (const f of readdirSync(reportsDir)) if (SEED_REPORT.test(f)) rmSync(join(reportsDir, f));
      const reports: PlaytestReport[] = [];
      for (const seed of seeds) {
        try {
          const res = await runSmoke({ dir: dist, seed, ticks: stage.ticks ?? 600, outDir: reportsDir, replayCheck: true, reportName: `playtest-seed${seed}.json` });
          reports.push(res.report);
          if (!res.report.passed) failures.push(`seed ${seed}: ${res.report.failures.join('; ')}`);
        } catch (e) {
          failures.push(`seed ${seed}: ${(e as Error).message}`);
        }
      }
      if (reports.length > 0) {
        mkdirSync(reportsDir, { recursive: true });
        writeFileSync(join(reportsDir, 'playtest-report.json'), JSON.stringify(mergeReports(reports), null, 2) + '\n');
      }
      return { name, passed: failures.length === 0, detail: failures.join('\n') };
    }
    case 'budget': {
      const problems: string[] = [];
      const gameJs = join(gameDir, 'dist', 'game.js');
      if (existsSync(gameJs)) {
        const gz = gzipSync(readFileSync(gameJs)).length / 1024;
        if (gz > (budgets['gameJsKbGzip'] ?? Infinity)) problems.push(`game.js ${gz.toFixed(0)} KB gzip > ${budgets['gameJsKbGzip']} KB`);
      } else {
        problems.push('dist/game.js missing');
      }
      const assetsMb = dirBytes(join(gameDir, 'dist', 'assets')) / 1048576;
      if (assetsMb > (budgets['assetsMb'] ?? Infinity)) problems.push(`assets ${assetsMb.toFixed(2)} MB > ${budgets['assetsMb']} MB`);
      const reportPath = join(reportsDir, 'playtest-report.json');
      if (existsSync(reportPath)) {
        const rep = JSON.parse(readFileSync(reportPath, 'utf8')) as PlaytestReport;
        // The worst seed decides: frame time and heap are the highest any smoke run saw.
        const worst = (k: string) => Math.max(0, ...rep.bots.map((b) => Number(b.metrics?.[k] ?? 0)));
        const m: Record<string, number> = { frameMsP95: worst('frameMsP95'), heapMB: worst('heapMB') };
        if ((rep.readyMs ?? 0) > (budgets['readyMs'] ?? Infinity)) problems.push(`readyMs ${rep.readyMs} > ${budgets['readyMs']}`);
        if ((m['frameMsP95'] ?? 0) > (budgets['frameMsP95'] ?? Infinity) * 1.5) problems.push(`frameMsP95 ${m['frameMsP95']} > ${budgets['frameMsP95']} (x1.5 headless allowance)`);
        if ((m['heapMB'] ?? 0) > (budgets['heapMb'] ?? Infinity)) problems.push(`heap ${m['heapMB']} MB > ${budgets['heapMb']} MB`);
      } else {
        problems.push('no playtest report; run the smoke check first');
      }
      return { name, passed: problems.length === 0, detail: problems.join('\n') };
    }
    default:
      return { name, passed: false, detail: `unknown check '${name}'` };
  }
}

const t0 = Date.now();
const checks: Check[] = [];
for (const name of stage.gate) {
  const c = await check(name);
  checks.push(c);
  console.log(`${c.passed ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? `\n  ${c.detail.split('\n').join('\n  ')}` : ''}`);
  if (!c.passed && (name === 'build' || name === 'typecheck')) break; // later checks depend on these
}
const passed = checks.every((c) => c.passed) && checks.length === stage.gate.length;
const signature = checks.filter((c) => !c.passed).map((c) => `${c.name}:${c.detail.split('\n')[0] ?? ''}`).join('|');
const reportPath = join(reportsDir, `gate-${stage.stage}.json`);
let stalled = false;
if (!passed && existsSync(reportPath)) {
  try {
    const prev = JSON.parse(readFileSync(reportPath, 'utf8')) as GateReport & { signature?: string };
    stalled = prev.passed === false && prev.signature === signature;
  } catch {
    stalled = false;
  }
}
const report: GateReport & { signature: string; attempt: number } = { stage: stage.stage, passed, stalled, checks, durationMs: Date.now() - t0, signature, attempt: stage.attempt ?? 1 };
mkdirSync(reportsDir, { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`${passed ? 'GATE PASSED' : stalled ? 'GATE FAILED (stalled)' : 'GATE FAILED'} in ${report.durationMs} ms -> ${reportPath}`);
process.exit(passed ? 0 : 2);
