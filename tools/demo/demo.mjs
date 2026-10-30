// `pnpm demo`: build the engine and sample, point the harness at the sample as its game, run the gate, print evidence.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

// The create pipeline in dry-run mode: GDD -> systems -> scaffold -> behaviour -> implement -> levels -> integrate ->
// playtest -> juice -> review -> budget -> publish, with every gate real and no model call (the fake provider answers).
const create = spawnSync(process.execPath, ['--import', 'tsx', worker, 'create', '--prompt', 'A tight cave platformer about a lantern-carrying mole who dashes through crumbling tunnels, with coins to collect and beetles to stomp.', '--genre', 'platformer', '--tier', 'small', '--seed', '1', '--dry-run'], { cwd: join(root, 'workers', 'generator'), env, encoding: 'utf8' });
const { gameId, jobId: createJobId } = JSON.parse(create.stdout.trim().split('\n').pop());
const createRun = spawnSync(process.execPath, ['--import', 'tsx', worker, 'run', '--once'], { cwd: join(root, 'workers', 'generator'), env, stdio: 'inherit' });
const store2 = JSON.parse(readFileSync(join(storeDir, 'store.json'), 'utf8'));
const createJob = store2.jobs.find((j) => j.id === createJobId);
const game = store2.games.find((g) => g.id === gameId);
const head = store2.versions.find((v) => v.id === game?.headVersionId);
const createStages = store2.trajectories.filter((t) => t.jobId === createJobId).map((t) => `${t.stage}:${t.passed ? 'pass' : 'fail'}@${t.attempt}`);

const bucketPath = (p) => join(storeDir, 'buckets', p.slice(0, p.indexOf('/')), p.slice(p.indexOf('/') + 1));

// "Anything else": a freeform idea through its own plan (its cast named after its systems, drawn from the idea, every
// level proven by a recorded run), published with the keys its systems use.
const ffCreate = spawnSync(process.execPath, ['--import', 'tsx', worker, 'create', '--prompt', 'A moth carrying lanterns home through a night forest: collect them on the way, and mind the frogs.', '--genre', 'freeform', '--tier', 'small', '--seed', '1', '--dry-run'], { cwd: join(root, 'workers', 'generator'), env, encoding: 'utf8' });
const { gameId: ffGameId, jobId: ffJobId } = JSON.parse(ffCreate.stdout.trim().split('\n').pop());
const ffRun = spawnSync(process.execPath, ['--import', 'tsx', worker, 'run', '--once'], { cwd: join(root, 'workers', 'generator'), env, stdio: 'inherit' });
const storeFf = JSON.parse(readFileSync(join(storeDir, 'store.json'), 'utf8'));
const ffGame = storeFf.games.find((g) => g.id === ffGameId);
const ffHead = storeFf.versions.find((v) => v.id === ffGame?.headVersionId);
const freeform = {
  gameId: ffGameId,
  runStatus: ffRun.status,
  jobStatus: storeFf.jobs.find((j) => j.id === ffJobId)?.status,
  state: ffGame?.state,
  stages: storeFf.trajectories.filter((t) => t.jobId === ffJobId).map((t) => `${t.stage}:${t.passed ? 'pass' : 'fail'}@${t.attempt}`),
  base: ffHead?.design?.gdd?.base ?? null,
  controls: ffHead?.design?.controls ?? null,
  sprites: ffHead?.bundlePath && existsSync(join(bucketPath(ffHead.bundlePath), 'content', 'sprites.json')) ? JSON.parse(readFileSync(join(bucketPath(ffHead.bundlePath), 'content', 'sprites.json'), 'utf8')).sprites.length : 0,
};

// The level editor path: an authored level (a coin on the spawn tile) runs apply-content -> playtest -> budget ->
// publish. The validator and the solver bot accept or reject it; no model is called.
let edit = null;
if (head?.bundlePath && existsSync(join(bucketPath(head.bundlePath), 'content', 'index.json'))) {
  const index = JSON.parse(readFileSync(join(bucketPath(head.bundlePath), 'content', 'index.json'), 'utf8'));
  const levelRel = index.levels[0];
  const level = JSON.parse(readFileSync(join(bucketPath(head.bundlePath), 'content', levelRel), 'utf8'));
  const authored = { ...level, entities: [...level.entities, { type: 'coin', x: level.spawn.x, y: level.spawn.y, props: {} }] };
  const contentFile = join(root, '.gg-work', `demo-authored-${gameId}.json`);
  mkdirSync(dirname(contentFile), { recursive: true });
  writeFileSync(contentFile, JSON.stringify({ levels: [authored] }));
  const enq = spawnSync(process.execPath, ['--import', 'tsx', worker, 'edit', gameId, '--message', 'Level editor: a coin on the spawn tile', '--content', contentFile, '--dry-run'], { cwd: join(root, 'workers', 'generator'), env, encoding: 'utf8' });
  if (enq.status !== 0) {
    console.error(`demo: enqueueing the authored edit failed\n${enq.stderr}`);
    process.exit(1);
  }
  const editJobId = JSON.parse(enq.stdout.trim().split('\n').pop()).jobId;
  const editRun = spawnSync(process.execPath, ['--import', 'tsx', worker, 'run', '--once'], { cwd: join(root, 'workers', 'generator'), env, stdio: 'inherit' });
  const store3 = JSON.parse(readFileSync(join(storeDir, 'store.json'), 'utf8'));
  const editJob = store3.jobs.find((j) => j.id === editJobId);
  const head3 = store3.versions.find((v) => v.id === store3.games.find((g) => g.id === gameId)?.headVersionId);
  const published = head3?.bundlePath ? JSON.parse(readFileSync(join(bucketPath(head3.bundlePath), 'content', levelRel), 'utf8')) : null;
  edit = {
    jobId: editJobId,
    kind: editJob?.kind,
    status: editJob?.status,
    runStatus: editRun.status,
    stages: store3.trajectories.filter((t) => t.jobId === editJobId).map((t) => `${t.stage}:${t.passed ? 'pass' : 'fail'}@${t.attempt}`),
    newHead: Boolean(head3) && head3.id !== head.id,
    coinOnSpawn: Boolean(published?.entities.some((e) => e.type === 'coin' && e.x === level.spawn.x && e.y === level.spawn.y)),
    error: editJob?.error ?? null,
  };
}
console.log('\n=== evidence bundle ===');
console.log(JSON.stringify({
  gate: { stage: report.stage, passed: report.passed, checks: report.checks.map((c) => `${c.name}:${c.passed ? 'pass' : 'fail'}`), durationMs: report.durationMs },
  job: { id: jobId, status: job?.status, events: jobEvents, trajectoryPassed: trajectory?.passed, versionKind: version?.kind, versionIsHead: version?.isHead, checkpoint: version?.sourcePath },
  playtest: { passed: playtest.passed, replayHashMatch: playtest.replayHashMatch, readyMs: playtest.readyMs, hash: playtest.bots[0]?.finalHash, metrics: playtest.bots[0]?.metrics, consoleErrors: playtest.consoleErrors.length },
  screenshot: join(sample, 'reports', `smoke-seed${playtest.seeds[0]}-tick${playtest.bots[0]?.ticks}.png`),
  create: { gameId, slug: game?.slug, state: game?.state, jobStatus: createJob?.status, stages: createStages, bundlePath: head?.bundlePath, evidence: head?.design?.evidence ? { gates: head.design.evidence.gates.map((g) => `${g.stage}:${g.passed ? 'pass' : 'fail'}`), playtest: head.design.evidence.playtest, thumbnail: head.design.evidence.thumbnail } : null },
  edit,
  freeform,
}, null, 2));
const ok = gate.status === 0 && run.status === 0 && job?.status === 'succeeded' && version?.isHead === true && createRun.status === 0 && createJob?.status === 'succeeded' && game?.state === 'playable' && Boolean(head?.bundlePath) && edit?.kind === 'edit_content' && edit.status === 'succeeded' && edit.newHead && edit.coinOnSpawn && freeform.runStatus === 0 && freeform.jobStatus === 'succeeded' && freeform.state === 'playable' && freeform.base === 'platformer' && Array.isArray(freeform.controls) && freeform.controls.length > 1 && freeform.sprites > 0;
process.exit(ok ? 0 : 1);
