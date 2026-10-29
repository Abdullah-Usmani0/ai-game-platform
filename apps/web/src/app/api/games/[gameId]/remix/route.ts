import { randomBytes } from 'node:crypto';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Remix: fork the game's head version into a new game the caller owns; edits on it start from that checkpoint. Removed and suspended games refuse. */
export async function POST(_req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) return Response.json({ error: 'not found' }, { status: 404 });
  if (!game.headVersionId) return Response.json({ error: 'the game has no accepted version to remix' }, { status: 409 });
  const slug = `${game.slug.replace(/-[0-9a-f]{4}$/, '').slice(0, 30)}-remix-${randomBytes(2).toString('hex')}`;
  let remix;
  try {
    remix = await store.forkGame(game.headVersionId, { ownerId: await viewerId(), slug, title: `${game.title} (remix)` });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 409 });
  }
  return Response.json({ gameId: remix.id, slug: remix.slug, headVersionId: remix.headVersionId }, { status: 201 });
}
