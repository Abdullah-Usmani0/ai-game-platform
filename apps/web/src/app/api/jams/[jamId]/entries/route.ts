import { errorMessage, viewerId } from '@/lib/identity';
import { jamErrorStatus } from '@/lib/jams';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The owner enters a game (its current head is frozen as the entry) or, with withdraw: true, takes it out again. */
export async function POST(req: Request, ctx: { params: Promise<{ jamId: string }> }): Promise<Response> {
  const { jamId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { gameId?: unknown; withdraw?: unknown };
  if (typeof body.gameId !== 'string' || !body.gameId) return Response.json({ error: 'gameId is required' }, { status: 400 });
  const store = getStore();
  const jam = await store.getJam(jamId);
  if (!jam) return Response.json({ error: 'jam not found' }, { status: 404 });
  const me = await viewerId();
  try {
    if (body.withdraw === true) {
      await store.withdrawFromJam(jam.id, body.gameId, me);
      return Response.json({ withdrawn: true });
    }
    return Response.json({ entry: await store.submitToJam(jam.id, body.gameId, me) }, { status: 201 });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: jamErrorStatus(errorMessage(e)) });
  }
}
