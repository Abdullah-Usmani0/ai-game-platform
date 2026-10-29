import { PlayReport } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** A finished play session (sendBeacon from the play page on pagehide, or the tester desk before reporting). */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text().catch(() => '');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  const parsed = PlayReport.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const store = getStore();
  const version = await store.getVersion(parsed.data.versionId);
  if (!version || version.gameId !== parsed.data.gameId) return Response.json({ error: 'version not found for this game' }, { status: 404 });
  try {
    const play = await store.recordPlay({ ...parsed.data, userId: await viewerId() });
    return Response.json({ play }, { status: 201 });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
