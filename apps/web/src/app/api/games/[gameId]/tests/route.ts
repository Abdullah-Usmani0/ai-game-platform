import { TestRequest } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Ask testers to play the head version: `needed` reports, each paid `rewardCredits`. Owner only. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) return Response.json({ error: 'not found' }, { status: 404 });
  const me = await viewerId();
  if (game.ownerId !== me) return Response.json({ error: 'only the owner can ask for testers' }, { status: 403 });
  if (!game.headVersionId) return Response.json({ error: 'the game has no accepted version yet' }, { status: 409 });
  const parsed = TestRequest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    const queue = await store.enqueueTest({ gameId, versionId: game.headVersionId, requestedBy: me, ...parsed.data });
    return Response.json({ queue }, { status: 201 });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 409 });
  }
}
