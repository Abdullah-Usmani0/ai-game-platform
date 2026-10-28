import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GateReport } from '@gg/schemas';

export interface GateRun {
  report: GateReport;
  reportPath: string;
  log: string;
}

/** The worker-owned gate: runs `pnpm gate` in the work dir and parses the report, regardless of runner. */
export function runGate(workDir: string, gameDir: string, stage: string): GateRun {
  const r = spawnSync('pnpm', ['gate'], { cwd: workDir, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 32 * 1024 * 1024 });
  const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const reportPath = join(gameDir, 'reports', `gate-${stage}.json`);
  if (!existsSync(reportPath)) {
    return {
      report: { stage, passed: false, stalled: false, checks: [{ name: 'gate', passed: false, detail: `no report written; exit ${r.status}: ${log.slice(-800)}` }], durationMs: 0 },
      reportPath,
      log,
    };
  }
  return { report: GateReport.parse(JSON.parse(readFileSync(reportPath, 'utf8'))), reportPath, log };
}
