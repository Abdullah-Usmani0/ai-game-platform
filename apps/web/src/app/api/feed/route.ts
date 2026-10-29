import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const items = await getStore().listFeed({ limit: 50 });
  return Response.json({
    items: items.map(({ game, head, stats }) => ({ id: game.id, title: game.title, genre: game.genre, ownerId: game.ownerId, bundleBase: bundleBaseUrl(head.bundlePath), tested: (game.listing as { tested?: unknown }).tested ?? null, stats })),
  });
}
