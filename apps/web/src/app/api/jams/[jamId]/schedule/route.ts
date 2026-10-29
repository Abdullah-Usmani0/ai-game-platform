import { jamPhase } from '@gg/db';
import { JamSchedule } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { jamErrorStatus } from '@/lib/jams';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Moderators move a jam's moments: extend submissions, open voting now, publish results now. */
export async function POST(req: Request, ctx: { params: Promise<{ jamId: string }> }): Promise<Response> {
  const { jamId } = await ctx.params;
  const parsed = JamSchedule.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || 'schedule'}: ${i.message}`).join('; ') }, { status: 400 });
  const store = getStore();
  const found = await store.getJam(jamId);
  if (!found) return Response.json({ error: 'jam not found' }, { status: 404 });
  try {
    const jam = await store.setJamSchedule(found.id, await viewerId(), parsed.data);
    return Response.json({ jam: { ...jam, phase: jamPhase(jam) } });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: jamErrorStatus(errorMessage(e)) });
  }
}
