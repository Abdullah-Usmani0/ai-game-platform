import { HEAT_CELL } from '@gg/db';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Where other players died, spent their time and left the game unfinished, per level of a version (the head unless
 * ?version= names another), counted per cell of ?cell= pixels (the level's tile size). The game's owner only.
 */
export async function GET(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) return Response.json({ error: 'not found' }, { status: 404 });
  if (game.ownerId !== (await viewerId())) return Response.json({ error: 'only the owner sees where players died and quit' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const versionId = q.get('version') ?? game.headVersionId;
  if (!versionId) return Response.json({ error: 'the game has no accepted version yet' }, { status: 409 });
  try {
    return Response.json(await store.playHeatmap(gameId, versionId, Number(q.get('cell') ?? HEAT_CELL.default)));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
