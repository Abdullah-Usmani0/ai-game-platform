// `pnpm demo`: build the engine and sample, point the harness at the sample as its game, run the gate, print evidence.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const harness = join(root, 'harness');
const sample = join(root, 'samples', 'platformer');
const sh = (cmd, args, cwd = root) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`demo: '${cmd} ${args.join(' ')}' failed with status ${r.status}`);
    process.exit(r.status ?? 1);
  }
};
sh('pnpm', ['--filter', '@gg/engine', 'build']);
sh('pnpm', ['--filter', '@gg/engine', 'sync-skills']);
sh('pnpm', ['--filter', '@gg/sample-platformer', 'build']);
const gameLink = join(harness, 'game');
if (existsSync(gameLink) || (() => { try { lstatSync(gameLink); return true; } catch { return false; } })()) rmSync(gameLink, { recursive: true, force: true });
symlinkSync(sample, gameLink, 'dir');
copyFileSync(join(harness, 'stage.example.json'), join(harness, 'stage.json'));
const gate = spawnSync('pnpm', ['gate'], { cwd: harness, stdio: 'inherit' });
const report = JSON.parse(readFileSync(join(sample, 'reports', 'gate-smoke.json'), 'utf8'));

// The worker path: a job row goes queued -> running -> gate -> checkpoint -> accepted version -> succeeded.
const storeDir = join(root, '.gg-store-demo');
rmSync(storeDir, { recursive: true, force: true });
const env = { ...process.env, GG_STORE_DIR: storeDir, GG_WORK_ROOT: join(root, '.gg-work') };
const worker = join(root, 'workers', 'generator', 'src', 'cli.ts');
const enqueue = spawnSync(process.execPath, ['--import', 'tsx', worker, 'enqueue', '--stages', 'smoke'], { cwd: join(root, 'workers', 'generator'), env, encoding: 'utf8' });
const jobId = JSON.parse(enqueue.stdout.trim().split('\n').pop()).enqueued;
const run = spawnSync(process.execPath, ['--import', 'tsx', worker, 'run', '--once'], { cwd: join(root, 'workers', 'generator'), env, stdio: 'inherit' });
const store = JSON.parse(readFileSync(join(storeDir, 'store.json'), 'utf8'));
const job = store.jobs.find((j) => j.id === jobId);
const jobEvents = store.events.filter((e) => e.jobId === jobId).map((e) => `${e.seq}:${e.type}`);
const trajectory = store.trajectories.find((t) => t.jobId === jobId);
const version = store.versions.find((v) => v.id === job?.resultVersionId);
const playtest = JSON.parse(readFileSync(join(sample, 'reports', 'playtest-report.json'), 'utf8'));
console.log('\n=== evidence bundle ===');
console.log(JSON.stringify({
  gate: { stage: report.stage, passed: report.passed, checks: report.checks.map((c) => `${c.name}:${c.passed ? 'pass' : 'fail'}`), durationMs: report.durationMs },
  job: { id: jobId, status: job?.status, events: jobEvents, trajectoryPassed: trajectory?.passed, versionKind: version?.kind, versionIsHead: version?.isHead, checkpoint: version?.sourcePath },
  playtest: { passed: playtest.passed, replayHashMatch: playtest.replayHashMatch, readyMs: playtest.readyMs, hash: playtest.bots[0]?.finalHash, metrics: playtest.bots[0]?.metrics, consoleErrors: playtest.consoleErrors.length },
  screenshot: join(sample, 'reports', `smoke-seed${playtest.seeds[0]}-tick${playtest.bots[0]?.ticks}.png`),
}, null, 2));
const ok = gate.status === 0 && run.status === 0 && job?.status === 'succeeded' && version?.isHead === true;
process.exit(ok ? 0 : 1);
