import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Job status with its event stream and per-attempt trajectories (the progress panel polls this). */
export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const { jobId } = await ctx.params;
  const store = getStore();
  const job = await store.getJob(jobId);
  if (!job) return Response.json({ error: 'not found' }, { status: 404 });
  const [events, trajectories] = await Promise.all([store.listEvents(jobId), store.listTrajectories(jobId)]);
  return Response.json({
    job: { id: job.id, kind: job.kind, status: job.status, stage: job.stage, costUsd: job.costUsd, turns: job.turns, resultVersionId: job.resultVersionId, error: job.error, createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt },
    events: events.map((e) => ({ seq: e.seq, ts: e.ts, stage: e.stage, type: e.type, payload: e.payload })),
    trajectories: trajectories.map((t) => ({ stage: t.stage, attempt: t.attempt, passed: t.passed, model: t.model, costUsd: t.costUsd, durationMs: t.durationMs, failureMode: t.failureMode })),
  });
}
