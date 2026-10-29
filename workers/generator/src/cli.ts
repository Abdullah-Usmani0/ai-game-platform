import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '@gg/db';
import { CreateRequest, EditRequest } from '@gg/schemas';
import { slugify, titleFromPrompt } from './gdd-draft.js';
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
    prompt: { type: 'string' },
    genre: { type: 'string', default: 'platformer' },
    tier: { type: 'string', default: 'small' },
    title: { type: 'string' },
    seed: { type: 'string' },
    message: { type: 'string' },
    content: { type: 'string' },
    refs: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    budget: { type: 'string' },
  },
});
const store = storeFromEnv({ ...process.env, GG_STORE_DIR: process.env['GG_STORE_DIR'] ?? resolve(repoRoot, '.gg-store') });
const cmd = positionals[0];

if (cmd === 'enqueue') {
  // Gate-only job over an existing game package (the demo and regression runs).
  const stages = values.stages.split(',').map((s) => s.trim()).filter(Boolean).map((stage) => ({ stage, runner: stage === 'smoke' ? 'none' : undefined, gate: [], task: values.task }));
  const job = await store.enqueueJob({ gameId: values['game-id'], userId: values.user, kind: 'create', input: { gameSource: resolve(values.game), stages } });
  console.log(JSON.stringify({ enqueued: job.id, stages: stages.map((s) => s.stage) }));
} else if (cmd === 'create') {
  if (!values.prompt) throw new Error('usage: gg-worker create --prompt TEXT [--genre platformer|survivors|topdown-action] [--tier small|medium|large] [--title T] [--seed N] [--refs "Celeste, Hades"] [--dry-run]');
  const request = CreateRequest.parse({ prompt: values.prompt, genre: values.genre, scopeTier: values.tier, title: values.title, seed: values.seed ? Number(values.seed) : undefined, dryRun: values['dry-run'], referenceTitles: values.refs ? values.refs.split(',').map((r) => r.trim()).filter(Boolean) : [] });
  const title = request.title ?? titleFromPrompt(request.prompt);
  const slug = `${slugify(title)}-${randomBytes(2).toString('hex')}`;
  const game = await store.createGame({ ownerId: values.user, slug, title, genre: request.genre, conceptMd: request.prompt, concept: { scopeTier: request.scopeTier, referenceTitles: request.referenceTitles } });
  const job = await store.enqueueJob({ gameId: game.id, userId: values.user, kind: 'create', input: request, budgetUsdCap: values.budget ? Number(values.budget) : undefined });
  console.log(JSON.stringify({ gameId: game.id, slug, jobId: job.id, dryRun: request.dryRun }));
} else if (cmd === 'edit') {
  const gameId = positionals[1];
  if (!gameId || !values.message) throw new Error('usage: gg-worker edit <gameId> --message TEXT [--content levels.json] [--dry-run]');
  const game = await store.getGame(gameId);
  if (!game) throw new Error(`game ${gameId} not found`);
  // --content: a JSON file { "levels": [LevelJson, ...] } authored outside the model (what the level editor sends).
  const content = values.content ? (JSON.parse(readFileSync(resolve(values.content), 'utf8')) as unknown) : undefined;
  const request = EditRequest.parse({ message: values.message, dryRun: values['dry-run'], content });
  const job = await store.enqueueJob({ gameId, userId: values.user, kind: content ? 'edit_content' : 'edit_code', input: request, baseVersionId: game.headVersionId });
  console.log(JSON.stringify({ gameId, jobId: job.id, base: game.headVersionId }));
} else if (cmd === 'run') {
  const n = await workerLoop({ store, templateDir: resolve(values.template), workRoot: resolve(values['work-root']), once: values.once });
  console.log(JSON.stringify({ processed: n }));
} else if (cmd === 'events') {
  const jobId = positionals[1];
  if (!jobId) throw new Error('usage: gg-worker events <jobId>');
  const job = await store.getJob(jobId);
  const events = await store.listEvents(jobId);
  const trajectories = await store.listTrajectories(jobId);
  console.log(JSON.stringify({ status: job?.status, stage: job?.stage, costUsd: job?.costUsd, resultVersionId: job?.resultVersionId, error: job?.error, events: events.map((e) => `${e.seq} ${e.stage ?? '-'} ${e.type} ${JSON.stringify(e.payload).slice(0, 160)}`), trajectories: trajectories.map((t) => ({ stage: t.stage, attempt: t.attempt, passed: t.passed, model: t.model, costUsd: t.costUsd, durationMs: t.durationMs, failureMode: t.failureMode })) }, null, 2));
} else if (cmd === 'games') {
  const games = await store.listGames({ limit: 50 });
  for (const g of games) console.log(`${g.id}  ${g.state.padEnd(10)} ${g.genre.padEnd(10)} ${g.slug.padEnd(32)} head=${g.headVersionId ?? '-'}`);
} else {
  console.error('usage: gg-worker <create|edit|enqueue|run|events|games> ...');
  process.exit(2);
}
