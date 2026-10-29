import { JamVote } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { jamErrorStatus } from '@/lib/jams';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** A vote on an entry, 1-5 on fun, theme and look; it needs a 30 s play of the entered version, and replaces an earlier vote. */
export async function POST(req: Request, ctx: { params: Promise<{ jamId: string }> }): Promise<Response> {
  const { jamId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = JamVote.safeParse(body);
  if (typeof body['gameId'] !== 'string' || !parsed.success) return Response.json({ error: 'gameId and fun, theme and look from 1 to 5 are required' }, { status: 400 });
  const store = getStore();
  const jam = await store.getJam(jamId);
  if (!jam) return Response.json({ error: 'jam not found' }, { status: 404 });
  try {
    return Response.json({ vote: await store.voteInJam(jam.id, body['gameId'], await viewerId(), parsed.data) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: jamErrorStatus(errorMessage(e)) });
  }
}
