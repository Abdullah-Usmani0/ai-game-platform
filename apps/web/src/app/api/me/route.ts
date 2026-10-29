import { isFileStore, getStore } from '@/lib/store';
import { USER_COOKIE, validUserId, viewerId } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const me = await viewerId();
  const store = getStore();
  const [credits, strikes, moderator, trainingOptOut] = await Promise.all([store.creditBalance(me), store.activeStrikes(me), store.isModerator(me), store.trainingOptOut(me)]);
  return Response.json({ userId: me, credits, strikes, moderator, trainingOptOut });
}

/** Local development only: act as another user (testers, players) by name. */
export async function POST(req: Request): Promise<Response> {
  if (!isFileStore()) return Response.json({ error: 'identity switching is a local-development feature' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown };
  if (!validUserId(body.userId)) return Response.json({ error: 'user ids are 3-32 characters of a-z, 0-9, _ and -' }, { status: 400 });
  return new Response(JSON.stringify({ userId: body.userId }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': `${USER_COOKIE}=${body.userId}; Path=/; SameSite=Lax; Max-Age=31536000` },
  });
}
