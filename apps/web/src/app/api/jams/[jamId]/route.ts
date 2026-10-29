import { viewerId } from '@/lib/identity';
import { jamView } from '@/lib/jams';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The jam as the viewer sees it: phase, entries with the viewer's votes, their games that could enter, and results once voting closed. */
export async function GET(_req: Request, ctx: { params: Promise<{ jamId: string }> }): Promise<Response> {
  const { jamId } = await ctx.params;
  const store = getStore();
  const jam = await store.getJam(jamId);
  if (!jam) return Response.json({ error: 'jam not found' }, { status: 404 });
  return Response.json(await jamView(store, jam, await viewerId()));
}
