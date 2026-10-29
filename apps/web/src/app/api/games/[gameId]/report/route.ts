import { ReportInput } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Report a game (ip, abuse, broken, other). Three players' open ip/abuse/broken reports suspend it pending review. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const parsed = ReportInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    const result = await getStore().reportGame(gameId, await viewerId(), parsed.data);
    return Response.json(result, { status: 201 });
  } catch (e) {
    const msg = errorMessage(e);
    return Response.json({ error: msg }, { status: /not found/.test(msg) ? 404 : 409 });
  }
}
