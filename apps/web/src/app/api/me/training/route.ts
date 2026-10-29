import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The viewer's training consent. Opting out deletes every recorded training pair they contributed to. */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { optOut?: unknown };
  if (typeof body.optOut !== 'boolean') return Response.json({ error: 'optOut must be true or false' }, { status: 400 });
  const me = await viewerId();
  const store = getStore();
  try {
    await store.setTrainingOptOut(me, body.optOut);
    return Response.json({ trainingOptOut: await store.trainingOptOut(me) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
