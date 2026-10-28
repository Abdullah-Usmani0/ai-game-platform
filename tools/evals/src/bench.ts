import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { FileStore } from '@gg/db';
import { CreateRequest, ModelPolicy } from '@gg/schemas';
import { runJob } from '@gg/worker-generator';

/**
 * `pnpm bench`: run every benchmark prompt k times through the create pipeline and report pass rate per stage,
 * pass^k per prompt, cost and wall time per passing game. Dry runs need no key and grade the harness itself;
 * live runs (--live --policy file) grade a model policy. The JSON report is the regression record.
 */
const here = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(here, '../..');
const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    policy: { type: 'string' },
    k: { type: 'string', default: '3' },
    limit: { type: 'string' },
    genre: { type: 'string' },
    filter: { type: 'string' },
    out: { type: 'string', default: resolve(here, 'reports') },
    store: { type: 'string', default: resolve(here, '.bench-store') },
    'work-root': { type: 'string', default: resolve(here, '.bench-work') },
  },
});
const k = Number(values.k);
const dryRun = !values.live;
const prompts = (JSON.parse(readFileSync(resolve(here, 'prompts.json'), 'utf8')) as { prompts: Array<{ id: string; genre: string; scopeTier: string; prompt: string }> }).prompts
  .filter((p) => !values.genre || p.genre === values.genre)
  .filter((p) => !values.filter || p.id.includes(values.filter))
  .slice(0, values.limit ? Number(values.limit) : undefined);
const policy = values.policy ? ModelPolicy.parse(JSON.parse(readFileSync(resolve(values.policy), 'utf8'))) : null;
rmSync(values.store, { recursive: true, force: true });
rmSync(values['work-root'], { recursive: true, force: true });
const store = new FileStore(values.store);
mkdirSync(values.out, { recursive: true });

interface Run {
  prompt: string;
  genre: string;
  run: number;
  status: string;
  costUsd: number;
  durationMs: number;
  failedStage: string | null;
  stages: Record<string, { passed: boolean; attempts: number }>;
}
const runs: Run[] = [];
const t0 = Date.now();
for (const p of prompts) {
  for (let i = 0; i < k; i++) {
    const request = CreateRequest.parse({ prompt: p.prompt, genre: p.genre, scopeTier: p.scopeTier, seed: 1 + i, dryRun });
    const game = await store.createGame({ ownerId: 'bench', slug: `${p.id}-run${i + 1}`, title: `${p.id} run ${i + 1}`, genre: p.genre, conceptMd: p.prompt });
    await store.enqueueJob({ gameId: game.id, userId: 'bench', kind: 'create', input: request, policyVersion: policy?.version ?? 1 });
    const job = await store.claimJob('bench');
    if (!job) throw new Error('claim failed');
    const start = Date.now();
    let status: string;
    try {
      status = await runJob({ store, job, templateDir: resolve(repoRoot, 'harness'), workRoot: values['work-root'], workerId: 'bench', policy, log: () => {} });
    } catch (e) {
      status = `crashed: ${(e as Error).message.slice(0, 120)}`;
    }
    const after = await store.getJob(job.id);
    const trajectories = await store.listTrajectories(job.id);
    const stages: Run['stages'] = {};
    for (const t of trajectories) {
      const s = stages[t.stage] ?? { passed: false, attempts: 0 };
      s.attempts++;
      s.passed = s.passed || t.passed;
      stages[t.stage] = s;
    }
    const run: Run = { prompt: p.id, genre: p.genre, run: i + 1, status, costUsd: after?.costUsd ?? 0, durationMs: Date.now() - start, failedStage: (after?.error as { stage?: string } | null)?.stage ?? null, stages };
    runs.push(run);
    console.log(`${p.id} run ${i + 1}: ${status} in ${Math.round(run.durationMs / 1000)} s, $${run.costUsd.toFixed(3)}${run.failedStage ? ` (failed at ${run.failedStage})` : ''}`);
    rmSync(resolve(values['work-root'], job.id), { recursive: true, force: true });
  }
}

const byPrompt = prompts.map((p) => {
  const rs = runs.filter((r) => r.prompt === p.id);
  return { id: p.id, genre: p.genre, passAll: rs.every((r) => r.status === 'succeeded'), passed: rs.filter((r) => r.status === 'succeeded').length, runs: rs.length };
});
const stageNames = [...new Set(runs.flatMap((r) => Object.keys(r.stages)))];
const perStage = Object.fromEntries(
  stageNames.map((s) => {
    const seen = runs.filter((r) => r.stages[s]);
    const passed = seen.filter((r) => r.stages[s]!.passed).length;
    const attempts = seen.reduce((a, r) => a + r.stages[s]!.attempts, 0);
    return [s, { passRate: seen.length ? Math.round((passed / seen.length) * 1000) / 1000 : null, firstTryRate: seen.length ? Math.round((seen.filter((r) => r.stages[s]!.attempts === 1 && r.stages[s]!.passed).length / seen.length) * 1000) / 1000 : null, meanAttempts: seen.length ? Math.round((attempts / seen.length) * 100) / 100 : null }];
  }),
);
const passing = runs.filter((r) => r.status === 'succeeded');
const summary = {
  mode: dryRun ? 'dry' : 'live',
  policy: policy?.name ?? (dryRun ? 'fake' : 'store-default'),
  prompts: prompts.length,
  k,
  passAtK: byPrompt.length ? Math.round((byPrompt.filter((p) => p.passAll).length / byPrompt.length) * 1000) / 1000 : null,
  runPassRate: runs.length ? Math.round((passing.length / runs.length) * 1000) / 1000 : null,
  meanCostPerPassingGame: passing.length ? Math.round((passing.reduce((a, r) => a + r.costUsd, 0) / passing.length) * 1000) / 1000 : null,
  meanDurationS: runs.length ? Math.round(runs.reduce((a, r) => a + r.durationMs, 0) / runs.length / 1000) : null,
  totalDurationS: Math.round((Date.now() - t0) / 1000),
  perStage,
};
const report = { createdAt: new Date().toISOString(), summary, byPrompt, runs };
const outFile = resolve(values.out, `bench-${summary.mode}-${(policy?.name ?? 'fake').replace(/[^a-z0-9-]/gi, '_')}-${Date.now()}.json`);
writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log(`report: ${outFile}`);
process.exit(summary.passAtK === 1 || (summary.runPassRate ?? 0) >= 0.9 ? 0 : 1);
