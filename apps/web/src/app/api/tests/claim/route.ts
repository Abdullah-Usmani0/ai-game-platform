import { viewerId } from '@/lib/identity';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The viewer's open test, or a new one; 404 when nothing is waiting for testers. */
export async function POST(): Promise<Response> {
  const store = getStore();
  const me = await viewerId();
  const claim = await store.claimTest(me);
  if (!claim) return Response.json({ error: 'no games are waiting for testers right now' }, { status: 404 });
  const [game, version] = await Promise.all([store.getGame(claim.assignment.gameId), store.getVersion(claim.assignment.versionId)]);
  return Response.json({
    assignment: claim.assignment,
    queue: claim.queue,
    game: game ? { id: game.id, title: game.title, genre: game.genre } : null,
    bundleBase: bundleBaseUrl(version?.bundlePath ?? null),
    credits: await store.creditBalance(me),
  });
}
