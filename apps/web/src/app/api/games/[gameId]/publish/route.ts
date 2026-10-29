import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** List the game in the feed (or unlist it). Owner only; listing needs a head whose playtest passed and no broken test verdict. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) return Response.json({ error: 'not found' }, { status: 404 });
  if (game.ownerId !== (await viewerId())) return Response.json({ error: 'only the owner can publish this game' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { listed?: unknown };
  try {
    const updated = await store.setListed(gameId, body.listed !== false);
    return Response.json({ visibility: updated.visibility, state: updated.state });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 409 });
  }
}
