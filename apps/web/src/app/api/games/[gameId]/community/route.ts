import { viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Stats, the viewer's rating, listing state and test rounds of a game (the workspace community panel polls this). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) return Response.json({ error: 'not found' }, { status: 404 });
  const me = await viewerId();
  const [stats, myRating, tests] = await Promise.all([
    store.gameStats(gameId),
    store.getRating(gameId, me),
    store.listTests(gameId),
  ]);
  const isOwner = game.ownerId === me;
  const isModerator = await store.isModerator(me);
  const [ownerStrikes, openReports, takedowns] = await Promise.all([
    isOwner ? store.activeStrikes(me) : null,
    isOwner || isModerator ? store.listReports({ status: 'open', gameId }).then((r) => r.length) : null,
    isOwner && game.state === 'removed' ? store.listTakedowns(gameId) : [],
  ]);
  const unlisted = (game.listing as { unlisted?: { versionId?: string; note?: string } }).unlisted;
  return Response.json({
    viewer: me,
    isOwner,
    visibility: game.visibility,
    state: game.state,
    tested: (game.listing as { tested?: unknown }).tested ?? null,
    stats,
    myRating,
    // Report counts are for the owner and moderators; why the game is out of the feed is for its owner.
    moderation: {
      ownerStrikes,
      openReports,
      removedFor: isOwner && game.state === 'removed' ? (takedowns.filter((t) => t.action === 'removed').pop()?.terms ?? '') : null,
      unlistedFor: isOwner && unlisted?.versionId && unlisted.versionId === game.headVersionId ? (unlisted.note ?? '') : null,
    },
    tests: tests.queue.map((q) => ({
      ...q,
      submitted: tests.assignments.filter((a) => a.queueId === q.id && a.submittedAt).length,
      // Testers' verdicts and notes are feedback for the creator only.
      verdicts: isOwner
        ? tests.assignments
            .filter((a) => a.queueId === q.id && a.verdict)
            .map((a) => ({ verdict: a.verdict, tag: a.tag, note: a.note }))
        : [],
    })),
  });
}
