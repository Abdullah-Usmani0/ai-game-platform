import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { runSmoke } from '@gg/bots';
import type { GateReport, PlaytestReport } from '@gg/schemas';

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
    case 'smoke': {
      const dist = join(gameDir, 'dist');
      if (!existsSync(join(dist, 'index.html'))) return { name, passed: false, detail: `no bundle at ${dist}; run build first` };
      const seeds = stage.seeds ?? [1];
      const failures: string[] = [];
      for (const seed of seeds) {
        try {
          const res = await runSmoke({ dir: dist, seed, ticks: stage.ticks ?? 600, outDir: reportsDir, replayCheck: true });
          if (!res.report.passed) failures.push(`seed ${seed}: ${res.report.failures.join('; ')}`);
        } catch (e) {
          failures.push(`seed ${seed}: ${(e as Error).message}`);
        }
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
        const m = rep.bots[0]?.metrics ?? {};
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
