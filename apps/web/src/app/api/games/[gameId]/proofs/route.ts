import { ProofSubmission } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * A player's winning run on a level the version waits for (the play page sends it when the game reports the win). A
 * worker replays it on that version: 202 when it is queued, 200 with queued false when the level does not wait for a
 * run or another run of it is being replayed already.
 */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const parsed = ProofSubmission.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const { versionId, proof } = parsed.data;
  const store = getStore();
  const version = await store.getVersion(versionId).catch(() => null);
  if (!version || version.gameId !== gameId) return Response.json({ error: 'version not found for this game' }, { status: 404 });
  try {
    const queued = await store.submitProof({ gameId, versionId, level: proof.level, submittedBy: await viewerId(), proof });
    if (!queued) return Response.json({ queued: false, reason: `${proof.level} does not wait for a winning run, or one is being replayed already` });
    return Response.json({ queued: true, proof: { id: queued.row.id, level: queued.row.level, status: queued.row.status }, jobId: queued.job.id }, { status: 202 });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
