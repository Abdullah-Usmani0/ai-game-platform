import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '@gg/db';
import { workerLoop } from './worker.js';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    once: { type: 'boolean', default: false },
    'work-root': { type: 'string', default: process.env['GG_WORK_ROOT'] ?? resolve(repoRoot, '.gg-work') },
    template: { type: 'string', default: resolve(repoRoot, 'harness') },
    game: { type: 'string', default: resolve(repoRoot, 'samples/platformer') },
    'game-id': { type: 'string', default: 'sample-platformer' },
    user: { type: 'string', default: 'local-dev' },
    stages: { type: 'string', default: 'smoke' },
    task: { type: 'string' },
  },
});
const store = storeFromEnv({ ...process.env, GG_STORE_DIR: process.env['GG_STORE_DIR'] ?? resolve(repoRoot, '.gg-store') });
const cmd = positionals[0];

if (cmd === 'enqueue') {
  const stages = values.stages.split(',').map((s) => s.trim()).filter(Boolean).map((stage) => ({
    stage,
    runner: stage === 'smoke' ? 'none' : undefined,
    gate: stage === 'smoke' ? ['typecheck', 'lint', 'test', 'build', 'smoke', 'budget'] : ['typecheck', 'lint', 'test', 'build', 'smoke'],
    task: values.task,
  }));
  const job = await store.enqueueJob({ gameId: values['game-id'], userId: values.user, kind: 'create', input: { gameSource: resolve(values.game), stages } });
  console.log(JSON.stringify({ enqueued: job.id, stages: stages.map((s) => s.stage) }));
} else if (cmd === 'run') {
  const n = await workerLoop({ store, templateDir: resolve(values.template), workRoot: resolve(values['work-root']), once: values.once });
  console.log(JSON.stringify({ processed: n }));
} else if (cmd === 'events') {
  const jobId = positionals[1];
  if (!jobId) throw new Error('usage: gg-worker events <jobId>');
  const job = await store.getJob(jobId);
  const events = await store.listEvents(jobId);
  const trajectories = await store.listTrajectories(jobId);
  console.log(JSON.stringify({ status: job?.status, costUsd: job?.costUsd, resultVersionId: job?.resultVersionId, events: events.map((e) => `${e.seq} ${e.stage ?? '-'} ${e.type} ${JSON.stringify(e.payload).slice(0, 100)}`), trajectories: trajectories.map((t) => ({ stage: t.stage, attempt: t.attempt, passed: t.passed, model: t.model, costUsd: t.costUsd, durationMs: t.durationMs })) }, null, 2));
} else {
  console.error('usage: gg-worker <enqueue|run|events> [--once] [--game DIR] [--stages smoke,implement] [--task TEXT]');
  process.exit(2);
}
