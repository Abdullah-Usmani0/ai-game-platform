import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** A game with its versions (newest first) and jobs, as the workspace page shows them. */
export async function GET(_req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) return Response.json({ error: 'not found' }, { status: 404 });
  const [versions, jobs] = await Promise.all([store.listVersions(gameId), store.listJobs(gameId)]);
  const head = versions.find((v) => v.isHead) ?? null;
  return Response.json({
    game,
    head: head ? { ...head, bundleBase: bundleBaseUrl(head.bundlePath) } : null,
    versions: versions
      .slice()
      .reverse()
      .map((v) => ({ id: v.id, number: v.number, kind: v.kind, stage: v.stage, isHead: v.isHead, bundlePath: v.bundlePath, bundleBase: bundleBaseUrl(v.bundlePath), costUsd: v.costUsd, createdAt: v.createdAt, summary: (v.evidence as { summary?: string }).summary ?? '' })),
    jobs: jobs
      .slice()
      .reverse()
      .map((j) => ({ id: j.id, kind: j.kind, status: j.status, stage: j.stage, costUsd: j.costUsd, createdAt: j.createdAt, finishedAt: j.finishedAt, error: j.error, input: j.input })),
  });
}
