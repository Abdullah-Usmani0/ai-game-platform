import { AppealInput } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The owner appeals the game's removal: a counter-notice (with consent) for an ip takedown, a plain appeal otherwise. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const parsed = AppealInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    return Response.json({ appeal: await getStore().appealTakedown(gameId, await viewerId(), parsed.data) }, { status: 201 });
  } catch (e) {
    const msg = errorMessage(e);
    return Response.json({ error: msg }, { status: /not found/.test(msg) ? 404 : 409 });
  }
}
