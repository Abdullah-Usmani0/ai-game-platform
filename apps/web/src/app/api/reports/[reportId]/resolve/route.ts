import { ResolveInput } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Moderators: dismiss, warn (strike), license (ip) or remove (takedown and strike). */
export async function POST(req: Request, ctx: { params: Promise<{ reportId: string }> }): Promise<Response> {
  const { reportId } = await ctx.params;
  const parsed = ResolveInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    const { report, game } = await getStore().resolveReport(reportId, await viewerId(), parsed.data);
    return Response.json({ report, game: { id: game.id, state: game.state, visibility: game.visibility } });
  } catch (e) {
    const msg = errorMessage(e);
    return Response.json({ error: msg }, { status: /moderators/.test(msg) ? 403 : 409 });
  }
}
