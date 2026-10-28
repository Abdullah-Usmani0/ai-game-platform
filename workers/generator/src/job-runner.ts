import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobKind, JobRow, Store } from '@gg/db';
import { providerFor, registerProvider, stagePolicy } from '@gg/llm';
import { CreateRequest, EditRequest, EditRoute, type ModelPolicy, type Stage, type StagePolicy, type SystemsJson, type Trajectory } from '@gg/schemas';
import { genre as genreOf } from '@gg/templates/node';
import { checkpoint } from './checkpoint.js';
import { routeEdit } from './edit-router.js';
import { FakeProvider } from './fake-provider.js';
import { runGate, type GateRun } from './gate.js';
import { materialize, writeStageFile } from './materialize.js';
import { createPlan, editPlan } from './plan.js';
import { applyPreset, loadPresets } from './presets.js';
import { ClaudeSdkRunner } from './runners/claude-sdk.js';
import { NoneRunner } from './runners/none.js';
import { OpenRunner } from './runners/open.js';
import { StructuredRunner } from './runners/structured.js';
import type { Runner, StageContext, StageOutcome, StageSpec } from './runners/types.js';
import { WorkerRunner, genreOfGame } from './runners/worker.js';

/** Legacy explicit plan (the demo's gate-only job over an existing game package). */
export interface JobPlan {
  gameSource: string;
  stages: StageSpec[];
}

export interface RunJobOptions {
  store: Store;
  job: JobRow;
  templateDir: string;
  workRoot: string;
  workerId: string;
  log?: (line: string) => void;
  /** Overrides the store's active policy (evals and A/B runs). */
  policy?: ModelPolicy | null;
}

const RUNNERS: Record<string, Runner> = { none: new NoneRunner(), 'claude-sdk': new ClaudeSdkRunner(), open: new OpenRunner(), structured: new StructuredRunner(), worker: new WorkerRunner() };

interface Resolved {
  runnerKind: string;
  sp: StagePolicy | null;
  model: string;
  provider: string;
}

function resolveStage(policy: ModelPolicy | null, spec: StageSpec, dryRun: boolean): Resolved {
  if (spec.runner === 'none') return { runnerKind: 'none', sp: null, model: 'none', provider: 'none' };
  let sp: StagePolicy | null = null;
  if (policy && (policy.stages as Record<string, StagePolicy | undefined>)[spec.stage]) sp = stagePolicy(policy, spec.stage as Stage);
  let runnerKind: string = spec.runner ?? sp?.runner ?? 'claude-sdk';
  if (dryRun && (runnerKind === 'claude-sdk' || runnerKind === 'open')) runnerKind = 'none';
  const model = dryRun ? 'fake' : (spec.model ?? sp?.model ?? 'claude-sonnet-5-5');
  const provider = dryRun ? 'fake' : (spec.provider ?? sp?.provider ?? 'anthropic');
  return { runnerKind, sp, model, provider };
}

function readSystems(gameDir: string): SystemsJson | null {
  const p = join(gameDir, 'design', 'systems.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as SystemsJson) : null;
}

function listIds(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(suffix)) continue;
    try {
      const id = (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id?: string }).id;
      if (id) out.push(id);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * The stage state machine for one job: materialise -> for each stage: run -> gate -> (repair | escalate) -> checkpoint.
 * Every attempt is logged as a trajectory; the gate decides, never the runner's own claim of success.
 * Create jobs follow the create plan; edit jobs restore the base checkpoint, route the message and run that route's plan.
 */
export async function runJob(opts: RunJobOptions): Promise<'succeeded' | 'failed' | 'needs_human'> {
  const { store, job, log = () => {} } = opts;
  const presets = loadPresets(opts.templateDir);
  const policy = opts.policy !== undefined ? opts.policy : await store.activePolicy().catch(() => null);
  const workDir = join(opts.workRoot, job.id);
  const dryRunEnv = process.env['GG_DRY_RUN'] === '1';
  const game = await store.getGame(job.gameId).catch(() => null);
  let request: CreateRequest | null = null;
  let route: EditRoute | null = null;
  let stages: StageSpec[];
  let gameDir: string;
  let dryRun = dryRunEnv;

  const legacy = job.input as Partial<JobPlan>;
  if (typeof legacy.gameSource === 'string' && Array.isArray(legacy.stages)) {
    // Explicit plan over an existing game package (the demo's gate-only smoke job and regression runs).
    ({ gameDir } = materialize({ templateDir: opts.templateDir, workDir, gameSource: legacy.gameSource }));
    stages = legacy.stages.map((s) => applyPreset(s, presets));
  } else if (job.kind === 'create') {
    request = CreateRequest.parse(job.input);
    dryRun = dryRun || request.dryRun;
    ({ gameDir } = materialize({ templateDir: opts.templateDir, workDir }));
    stages = createPlan(presets);
    if (dryRun) registerProvider('fake', new FakeProvider({ genre: genreOf(request.genre), request }));
  } else if (job.kind.startsWith('edit_')) {
    const edit = EditRequest.parse(job.input);
    dryRun = dryRun || edit.dryRun;
    const baseId = edit.baseVersionId ?? job.baseVersionId ?? game?.headVersionId ?? null;
    if (!baseId) throw new Error('edit job needs a base version (no head version on the game)');
    const base = await store.getVersion(baseId);
    if (!base?.sourcePath) throw new Error(`base version ${baseId} has no checkpoint`);
    const slash = base.sourcePath.indexOf('/');
    const tgz = await store.getObject(base.sourcePath.slice(0, slash), base.sourcePath.slice(slash + 1));
    ({ gameDir } = materialize({ templateDir: opts.templateDir, workDir, checkpoint: tgz }));
    const g = genreOfGame({ request: null, gameDir });
    if (dryRun) registerProvider('fake', new FakeProvider({ genre: g, request: null }));
    const stored = job.input['route'] as EditRoute | undefined;
    if (stored) {
      route = EditRoute.parse(stored);
    } else {
      const r = resolveStage(policy, { stage: 'route', gate: [], runner: 'structured' }, dryRun);
      const routed = await routeEdit({
        provider: providerFor(r.provider),
        model: dryRun ? 'fake' : (policy?.stages.review?.model ?? r.model),
        message: edit.message,
        genre: g,
        systems: readSystems(gameDir),
        levelIds: listIds(join(gameDir, 'content', 'levels'), '.json'),
        behaviourIds: listIds(join(gameDir, 'content', 'behaviour'), '.fsm.json'),
      });
      route = routed.route;
      await store.updateJob(job.id, { costUsd: job.costUsd + routed.costUsd });
      job.costUsd += routed.costUsd;
    }
    await store.updateJob(job.id, { kind: `edit_${route.route}` as JobKind, input: { ...job.input, route }, baseVersionId: baseId });
    await store.appendEvent(job.id, 'assistant_summary', { route: route.route, confidence: route.confidence, targets: route.targets, designNotes: route.designNotes }, 'route');
    log(`edit routed to '${route.route}' (confidence ${route.confidence}): ${route.designNotes}`);
    stages = editPlan(route.route, presets);
  } else {
    throw new Error(`job kind '${job.kind}' needs a create request, an edit request or an explicit plan`);
  }
  if (game) await store.updateGame(game.id, { state: 'generating' }).catch(() => {});

  let totalCost = job.costUsd;
  let totalTurns = job.turns;
  let lastVersionId: string | null = job.baseVersionId;
  const finishFailed = async (status: 'failed' | 'needs_human', stage: string, reason: string) => {
    await store.updateJob(job.id, { status, finishedAt: new Date().toISOString(), error: { stage, reason } });
    await store.appendEvent(job.id, status === 'failed' ? 'finished' : 'needs_human', { status, stage, reason }, stage);
    if (game) await store.updateGame(game.id, { state: game.headVersionId ? 'playable' : 'draft' }).catch(() => {});
    return status;
  };

  for (const spec of stages) {
    let resolved = resolveStage(policy, spec, dryRun);
    const maxAttempts = (resolved.sp?.repairRounds ?? 1) + 1;
    let escalated = false;
    let passed = false;
    await store.updateJob(job.id, { stage: spec.stage });
    for (let attempt = 1; attempt <= maxAttempts + 1 && !passed; attempt++) {
      const isEscalation = attempt > maxAttempts;
      if (isEscalation) {
        if (!resolved.sp?.escalateTo || escalated || dryRun) break;
        escalated = true;
        resolved = { ...resolved, model: resolved.sp.escalateTo.model, provider: resolved.sp.escalateTo.provider };
        await store.appendEvent(job.id, 'escalation', { to: resolved.model }, spec.stage);
      }
      writeStageFile(workDir, { ...spec, runner: resolved.runnerKind as StageSpec['runner'] }, attempt, { model: resolved.model, budget: { usdLeft: Math.max(0, job.budgetUsdCap - totalCost), turnsLeft: spec.caps?.turns ?? resolved.sp?.caps.turns ?? null } });
      await store.appendEvent(job.id, 'stage_started', { attempt, runner: resolved.runnerKind, model: resolved.model }, spec.stage);
      const runner = RUNNERS[resolved.runnerKind];
      if (!runner) throw new Error(`no runner '${resolved.runnerKind}'`);
      const versionId = randomUUID();
      const ctx: StageContext = { jobId: job.id, gameId: job.gameId, spec, attempt, workDir, gameDir, policy: resolved.sp, model: resolved.model, provider: resolved.provider, store, log, dryRun, request, route, versionId };
      // Verify first: an agent stage whose gate already passes needs no session (and costs nothing).
      let outcome: StageOutcome | null = null;
      let gate: GateRun | null = null;
      if (spec.gateFirst && attempt === 1 && (resolved.runnerKind === 'claude-sdk' || resolved.runnerKind === 'open')) {
        const pre = runGate(workDir, gameDir, spec.stage);
        if (pre.report.passed) {
          gate = pre;
          outcome = { ok: true, summary: 'gate passed before any session (no model call)', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, durationMs: 0, turns: 0 };
          await store.appendEvent(job.id, 'warning', { note: 'gate-first: stage already passes, session skipped' }, spec.stage);
        }
      }
      if (!outcome || !gate) {
        outcome = await runner.run(ctx);
        gate = runGate(workDir, gameDir, spec.stage);
      }
      totalCost += outcome.costUsd;
      totalTurns += outcome.turns;
      passed = outcome.ok && gate.report.passed;
      // Every attempt's gate report is kept (the playbook and evals read failures as well as passes).
      const gateObject = await store
        .putObject('trajectories', `g/${job.gameId}/j/${job.id}/${spec.stage}-${attempt}-gate.json`, new TextEncoder().encode(JSON.stringify({ ...gate.report, summary: outcome.summary.slice(0, 2000), model: resolved.model, runner: resolved.runnerKind })), 'application/json')
        .catch(() => gate.reportPath);
      const trajectory: Trajectory = {
        jobId: job.id,
        stage: spec.stage,
        attempt,
        sampleIdx: 0,
        runner: resolved.runnerKind === 'none' || resolved.runnerKind === 'worker' ? 'structured' : (resolved.runnerKind as Trajectory['runner']),
        provider: resolved.provider,
        model: resolved.model,
        promptHash: outcome.promptHash ?? '',
        inputTokens: outcome.usage.inputTokens,
        cachedTokens: outcome.usage.cachedTokens ?? 0,
        outputTokens: outcome.usage.outputTokens,
        costUsd: outcome.costUsd,
        durationMs: outcome.durationMs + gate.report.durationMs,
        passed,
        gateReportPath: gateObject,
        failureMode: passed ? null : (outcome.failureMode ?? (gate.report.stalled ? 'repetition' : 'wrong_verification')),
        artifactPath: outcome.artifactPath ?? null,
        scrubbed: false,
      };
      await store.insertTrajectory(trajectory);
      await store.updateJob(job.id, { costUsd: totalCost, turns: totalTurns });
      await store.appendEvent(job.id, 'cost', { costUsd: outcome.costUsd, totalCost, turns: outcome.turns }, spec.stage);
      if (outcome.summary) await store.appendEvent(job.id, 'assistant_summary', { summary: outcome.summary.slice(0, 1000) }, spec.stage);
      if (passed) {
        const cp = await checkpoint(store, gameDir, job.gameId, job.id, spec.stage);
        const version = await store.insertVersion({
          id: versionId,
          gameId: job.gameId,
          kind: 'stage',
          stage: spec.stage,
          parentVersionId: lastVersionId,
          jobId: job.id,
          sourcePath: cp.path,
          bundlePath: outcome.version?.bundlePath ?? null,
          manifest: outcome.version?.manifest ?? null,
          design: outcome.version?.design ?? {},
          gateResults: gate.report as unknown as Record<string, unknown>,
          evidence: { summary: outcome.summary.slice(0, 2000), checkpointBytes: cp.bytes },
          engineVersion: readEngineVersion(gameDir),
          contentHash: outcome.version?.contentHash ?? null,
          costUsd: outcome.costUsd,
          policyVersion: policy?.version ?? null,
        });
        lastVersionId = version.id;
        await store.appendEvent(job.id, 'gate_passed', { attempt, checks: gate.report.checks.map((c) => c.name), versionId: version.id }, spec.stage);
        await store.appendEvent(job.id, 'checkpoint', { versionId: version.id, path: cp.path, bytes: cp.bytes }, spec.stage);
        log(`stage ${spec.stage} passed on attempt ${attempt} (${outcome.costUsd.toFixed(4)} USD, ${Math.round((outcome.durationMs + gate.report.durationMs) / 1000)} s)`);
      } else {
        const failing = gate.report.checks.filter((c) => !c.passed).map((c) => c.name);
        await store.appendEvent(job.id, 'gate_failed', { attempt, stalled: gate.report.stalled, failing, summary: outcome.summary.slice(0, 500), detail: gate.report.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail.slice(0, 300)}`) }, spec.stage);
        log(`stage ${spec.stage} failed on attempt ${attempt}: ${failing.join(', ') || outcome.summary.slice(0, 120)}`);
        if (totalCost >= job.budgetUsdCap) return finishFailed('needs_human', spec.stage, `budget exceeded (${totalCost.toFixed(2)} USD)`);
        if (attempt < maxAttempts) await store.appendEvent(job.id, 'retry', { attempt: attempt + 1 }, spec.stage);
      }
    }
    if (!passed) return finishFailed('failed', spec.stage, 'gate never passed');
  }
  if (lastVersionId && lastVersionId !== job.baseVersionId) await store.acceptVersion(lastVersionId);
  await store.updateJob(job.id, { status: 'succeeded', resultVersionId: lastVersionId, finishedAt: new Date().toISOString(), stage: null });
  await store.appendEvent(job.id, 'finished', { status: 'succeeded', versionId: lastVersionId, totalCost });
  return 'succeeded';
}

function readEngineVersion(gameDir: string): string | null {
  try {
    const j = JSON.parse(readFileSync(join(gameDir, 'dist', 'engine.json'), 'utf8')) as { phaser?: string; sdk?: string };
    return j.phaser && j.sdk ? `phaser-${j.phaser}/sdk-${j.sdk}` : null;
  } catch {
    return null;
  }
}
