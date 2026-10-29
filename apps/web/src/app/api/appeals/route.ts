import { viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Moderators: appeals with their game, the takedown they contest and the report behind it. */
export async function GET(req: Request): Promise<Response> {
  const store = getStore();
  if (!(await store.isModerator(await viewerId()))) return Response.json({ error: 'moderators only' }, { status: 403 });
  const status = new URL(req.url).searchParams.get('status');
  const appeals = await store.listAppeals(status === 'reinstated' || status === 'upheld' ? { status } : { status: 'open' });
  const out = [];
  for (const a of appeals) {
    const [game, takedowns] = await Promise.all([store.getGame(a.gameId), store.listTakedowns(a.gameId)]);
    const takedown = takedowns.find((t) => t.id === a.takedownId) ?? null;
    const report = takedown ? await store.getReport(takedown.reportId) : null;
    out.push({ ...a, game: game ? { id: game.id, title: game.title, state: game.state } : null, takedown: takedown ? { terms: takedown.terms, createdAt: takedown.createdAt } : null, report: report ? { kind: report.kind, note: report.note, rightsHolder: report.rightsHolder } : null });
  }
  return Response.json({ appeals: out });
}
