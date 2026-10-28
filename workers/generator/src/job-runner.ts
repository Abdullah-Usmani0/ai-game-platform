import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobRow, Store } from '@gg/db';
import { stagePolicy } from '@gg/llm';
import type { ModelPolicy, Stage, StagePolicy, Trajectory } from '@gg/schemas';
import { checkpoint } from './checkpoint.js';
import { runGate } from './gate.js';
import { materialize, writeStageFile } from './materialize.js';
import { ClaudeSdkRunner } from './runners/claude-sdk.js';
import { NoneRunner } from './runners/none.js';
import { StructuredRunner } from './runners/structured.js';
import type { Runner, StageContext, StageSpec } from './runners/types.js';

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
}

const RUNNERS: Record<string, Runner> = { none: new NoneRunner(), 'claude-sdk': new ClaudeSdkRunner(), structured: new StructuredRunner() };

function resolveStage(policy: ModelPolicy | null, spec: StageSpec): { runnerKind: string; sp: StagePolicy | null; model: string; provider: string } {
  if (spec.runner === 'none') return { runnerKind: 'none', sp: null, model: 'none', provider: 'none' };
  let sp: StagePolicy | null = null;
  if (policy && (policy.stages as Record<string, StagePolicy | undefined>)[spec.stage]) sp = stagePolicy(policy, spec.stage as Stage);
  const runnerKind = spec.runner ?? sp?.runner ?? 'claude-sdk';
  const model = spec.model ?? sp?.model ?? 'claude-sonnet-5-5';
  const provider = spec.provider ?? sp?.provider ?? 'anthropic';
  return { runnerKind, sp, model, provider };
}

/**
 * The stage state machine for one job: materialise -> for each stage: run -> gate -> (repair | escalate) -> checkpoint.
 * Every attempt is logged as a trajectory; the gate decides, never the runner's own claim of success.
 */
export async function runJob(opts: RunJobOptions): Promise<'succeeded' | 'failed' | 'needs_human'> {
  const { store, job, log = () => {} } = opts;
  const plan = job.input as unknown as JobPlan;
  if (!plan.gameSource || !Array.isArray(plan.stages)) throw new Error('job input must contain gameSource and stages');
  const policy = await store.activePolicy().catch(() => null);
  const workDir = join(opts.workRoot, job.id);
  const { gameDir } = materialize({ templateDir: opts.templateDir, workDir, gameSource: plan.gameSource });
  let totalCost = job.costUsd;
  let totalTurns = job.turns;
  let lastVersionId: string | null = null;

  for (const spec of plan.stages) {
    let resolved = resolveStage(policy, spec);
    const maxAttempts = (resolved.sp?.repairRounds ?? 1) + 1;
    let escalated = false;
    let passed = false;
    await store.updateJob(job.id, { stage: spec.stage });
    for (let attempt = 1; attempt <= maxAttempts + 1 && !passed; attempt++) {
      const isEscalation = attempt > maxAttempts;
      if (isEscalation) {
        if (!resolved.sp?.escalateTo || escalated) break;
        escalated = true;
        resolved = { ...resolved, model: resolved.sp.escalateTo.model, provider: resolved.sp.escalateTo.provider };
        await store.appendEvent(job.id, 'escalation', { to: resolved.model }, spec.stage);
      }
      writeStageFile(workDir, { ...spec, runner: resolved.runnerKind as StageSpec['runner'] }, attempt, { model: resolved.model, budget: { usdLeft: Math.max(0, job.budgetUsdCap - totalCost) } });
      await store.appendEvent(job.id, 'stage_started', { attempt, runner: resolved.runnerKind, model: resolved.model }, spec.stage);
      const runner = RUNNERS[resolved.runnerKind];
      if (!runner) throw new Error(`no runner '${resolved.runnerKind}'`);
      const ctx: StageContext = { jobId: job.id, gameId: job.gameId, spec, attempt, workDir, gameDir, policy: resolved.sp, model: resolved.model, provider: resolved.provider, store, log };
      const outcome = await runner.run(ctx);
      totalCost += outcome.costUsd;
      totalTurns += outcome.turns;
      const gate = runGate(workDir, gameDir, spec.stage);
      passed = outcome.ok && gate.report.passed;
      const trajectory: Trajectory = {
        jobId: job.id,
        stage: spec.stage,
        attempt,
        sampleIdx: 0,
        runner: resolved.runnerKind === 'none' ? 'structured' : (resolved.runnerKind as Trajectory['runner']),
        provider: resolved.provider,
        model: resolved.model,
        promptHash: outcome.promptHash ?? '',
        inputTokens: outcome.usage.inputTokens,
        cachedTokens: outcome.usage.cachedTokens ?? 0,
        outputTokens: outcome.usage.outputTokens,
        costUsd: outcome.costUsd,
        durationMs: outcome.durationMs + gate.report.durationMs,
        passed,
        gateReportPath: gate.reportPath,
        failureMode: passed ? null : (outcome.failureMode ?? (gate.report.stalled ? 'repetition' : 'wrong_verification')),
        artifactPath: outcome.artifactPath ?? null,
        scrubbed: false,
      };
      await store.insertTrajectory(trajectory);
      await store.updateJob(job.id, { costUsd: totalCost, turns: totalTurns });
      await store.appendEvent(job.id, 'cost', { costUsd: outcome.costUsd, totalCost, turns: outcome.turns }, spec.stage);
      if (passed) {
        const cp = await checkpoint(store, gameDir, job.gameId, job.id, spec.stage);
        const version = await store.insertVersion({
          gameId: job.gameId,
          kind: 'stage',
          stage: spec.stage,
          parentVersionId: lastVersionId,
          jobId: job.id,
          sourcePath: cp.path,
          bundlePath: null,
          manifest: null,
          design: {},
          gateResults: gate.report as unknown as Record<string, unknown>,
          evidence: { summary: outcome.summary.slice(0, 2000), checkpointBytes: cp.bytes },
          engineVersion: readEngineVersion(gameDir),
          contentHash: null,
          costUsd: outcome.costUsd,
          policyVersion: policy?.version ?? null,
        });
        lastVersionId = version.id;
        await store.appendEvent(job.id, 'gate_passed', { attempt, checks: gate.report.checks.map((c) => c.name) }, spec.stage);
        await store.appendEvent(job.id, 'checkpoint', { versionId: version.id, path: cp.path, bytes: cp.bytes }, spec.stage);
        log(`stage ${spec.stage} passed on attempt ${attempt} (${(outcome.costUsd).toFixed(4)} USD)`);
      } else {
        await store.appendEvent(job.id, 'gate_failed', { attempt, stalled: gate.report.stalled, failing: gate.report.checks.filter((c) => !c.passed).map((c) => c.name), summary: outcome.summary.slice(0, 500) }, spec.stage);
        log(`stage ${spec.stage} failed on attempt ${attempt}: ${gate.report.checks.filter((c) => !c.passed).map((c) => c.name).join(', ') || outcome.summary.slice(0, 120)}`);
        if (totalCost >= job.budgetUsdCap) {
          await store.appendEvent(job.id, 'needs_human', { reason: 'budget_exceeded', totalCost }, spec.stage);
          await store.updateJob(job.id, { status: 'needs_human', finishedAt: new Date().toISOString() });
          return 'needs_human';
        }
        if (attempt < maxAttempts) await store.appendEvent(job.id, 'retry', { attempt: attempt + 1 }, spec.stage);
      }
    }
    if (!passed) {
      await store.updateJob(job.id, { status: 'failed', finishedAt: new Date().toISOString(), error: { stage: spec.stage, reason: 'gate never passed' } });
      await store.appendEvent(job.id, 'finished', { status: 'failed', stage: spec.stage }, spec.stage);
      return 'failed';
    }
  }
  if (lastVersionId) await store.acceptVersion(lastVersionId);
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
