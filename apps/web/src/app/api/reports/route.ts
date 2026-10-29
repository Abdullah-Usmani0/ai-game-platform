import { viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Moderators: reports with their games, open first. */
export async function GET(req: Request): Promise<Response> {
  const store = getStore();
  const me = await viewerId();
  if (!(await store.isModerator(me))) return Response.json({ error: 'moderators only' }, { status: 403 });
  const status = new URL(req.url).searchParams.get('status') === 'resolved' ? 'resolved' : 'open';
  const reports = await store.listReports({ status });
  const games = new Map<string, { id: string; title: string; state: string; ownerId: string } | null>();
  for (const r of reports) {
    if (!games.has(r.gameId)) {
      const g = await store.getGame(r.gameId);
      games.set(r.gameId, g ? { id: g.id, title: g.title, state: g.state, ownerId: g.ownerId } : null);
    }
  }
  return Response.json({ reports: reports.map((r) => ({ ...r, game: games.get(r.gameId) ?? null })) });
}
