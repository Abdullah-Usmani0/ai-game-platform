import { RatingInput } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** One-tag rating (fun, confusing, broken, ugly); rating again replaces it. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const parsed = RatingInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    const rating = await getStore().rateGame(gameId, await viewerId(), parsed.data);
    return Response.json({ rating });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 404 });
  }
}
