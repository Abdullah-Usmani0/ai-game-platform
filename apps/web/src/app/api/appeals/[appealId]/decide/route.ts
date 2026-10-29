import { AppealDecision } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Moderators: reinstate (after a counter-notice's 14 days) or uphold an appeal. */
export async function POST(req: Request, ctx: { params: Promise<{ appealId: string }> }): Promise<Response> {
  const { appealId } = await ctx.params;
  const parsed = AppealDecision.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    const { appeal, games } = await getStore().decideAppeal(appealId, await viewerId(), parsed.data);
    return Response.json({ appeal, games: games.map((g) => ({ id: g.id, state: g.state, visibility: g.visibility })) });
  } catch (e) {
    const msg = errorMessage(e);
    return Response.json({ error: msg }, { status: /moderators/.test(msg) ? 403 : /not found/.test(msg) ? 404 : 409 });
  }
}
