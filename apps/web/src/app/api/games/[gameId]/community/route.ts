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
  return Response.json({
    viewer: me,
    isOwner,
    visibility: game.visibility,
    state: game.state,
    tested: (game.listing as { tested?: unknown }).tested ?? null,
    stats,
    myRating,
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
