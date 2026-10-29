import { sourceView, untarGz, type Store, type VersionRow } from '@gg/db';
import { canSeeWorkspace } from '@/lib/access';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function checkpointFiles(store: Store, sourcePath: string): Promise<Map<string, Uint8Array>> {
  const slash = sourcePath.indexOf('/');
  return untarGz(await store.getObject(sourcePath.slice(0, slash), sourcePath.slice(slash + 1)));
}

/** The accepted version this one was built on: up the parent chain to the first accepted version of the same game. */
function previousAccepted(versions: readonly VersionRow[], v: VersionRow): VersionRow | null {
  const byId = new Map(versions.map((x) => [x.id, x]));
  for (let p = v.parentVersionId ? byId.get(v.parentVersionId) : undefined; p; p = p.parentVersionId ? byId.get(p.parentVersionId) : undefined) {
    if (p.kind !== 'stage' && p.sourcePath) return p;
  }
  return null;
}

/**
 * The source of a version (the head unless ?version= names another): code, content, design, tests and config from its
 * checkpoint, each marked against the accepted version it was built on, with line diffs. Owner and moderators only.
 */
export async function GET(req: Request, ctx: { params: Promise<{ gameId: string }> }): Promise<Response> {
  const { gameId } = await ctx.params;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game || !(await canSeeWorkspace(store, game, await viewerId()))) return Response.json({ error: 'not found' }, { status: 404 });
  const versionId = new URL(req.url).searchParams.get('version') ?? game.headVersionId;
  if (!versionId) return Response.json({ error: 'the game has no accepted version yet' }, { status: 409 });
  const versions = await store.listVersions(gameId);
  const version = versions.find((v) => v.id === versionId);
  if (!version?.sourcePath) return Response.json({ error: 'no such version of this game' }, { status: 404 });
  const previous = previousAccepted(versions, version);
  try {
    const view = sourceView(await checkpointFiles(store, version.sourcePath), previous?.sourcePath ? await checkpointFiles(store, previous.sourcePath) : null);
    return Response.json({ versionId: version.id, number: version.number, previous: previous ? { id: previous.id, number: previous.number } : null, ...view });
  } catch (e) {
    return Response.json({ error: `could not read the checkpoint: ${errorMessage(e)}` }, { status: 500 });
  }
}
