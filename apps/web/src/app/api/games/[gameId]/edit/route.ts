import { EditRequest } from '@gg/schemas';
import { viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Enqueue an edit job; the worker routes the message (parameter, style, behaviour, content or code). Authored content (the level editor) skips routing. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) return Response.json({ error: 'not found' }, { status: 404 });
  const me = await viewerId();
  if (game.ownerId !== me) return Response.json({ error: 'only the owner can edit this game; remix it to make your own' }, { status: 403 });
  if (game.state === 'removed') return Response.json({ error: 'the game was removed by moderation; edits are closed' }, { status: 409 });
  if (!game.headVersionId) return Response.json({ error: 'the game has no accepted version yet' }, { status: 409 });
  const parsed = EditRequest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const job = await store.enqueueJob({ gameId, userId: me, kind: parsed.data.content ? 'edit_content' : 'edit_code', input: parsed.data, baseVersionId: game.headVersionId });
  return Response.json({ jobId: job.id }, { status: 201 });
}
