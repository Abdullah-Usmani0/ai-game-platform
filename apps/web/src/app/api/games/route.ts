import { randomBytes } from 'node:crypto';
import { CreateRequest } from '@gg/schemas';
import { getStore, OWNER_ID } from '@/lib/store';

export const dynamic = 'force-dynamic';

function slugify(s: string): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base.length >= 3 ? base : `game-${base}`;
}

function titleFromPrompt(prompt: string): string {
  const words = prompt.split(/[.!?\n]/)[0]!.replace(/[^a-zA-Z0-9' ]/g, ' ').split(/\s+/).filter((w) => w && !/^(a|an|the|about|with|where|that|of|and|in|on|for|to|make|build|create|game|i|want|me)$/i.test(w)).slice(0, 4);
  return words.length ? words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Untitled Game';
}

export async function GET(): Promise<Response> {
  const games = await getStore().listGames({ limit: 50 });
  return Response.json({ games });
}

/** Create a game row and enqueue its create job; a running worker picks it up. */
export async function POST(req: Request): Promise<Response> {
  const parsed = CreateRequest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const request = parsed.data;
  const store = getStore();
  const title = request.title ?? titleFromPrompt(request.prompt);
  const game = await store.createGame({ ownerId: OWNER_ID, slug: `${slugify(title)}-${randomBytes(2).toString('hex')}`, title, genre: request.genre, conceptMd: request.prompt, concept: { scopeTier: request.scopeTier, referenceTitles: request.referenceTitles } });
  const job = await store.enqueueJob({ gameId: game.id, userId: OWNER_ID, kind: 'create', input: request });
  return Response.json({ gameId: game.id, jobId: job.id, slug: game.slug }, { status: 201 });
}
