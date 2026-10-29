import { PLAY_SOURCES, type PlaySource } from '@gg/schemas';
import { PlayFrame } from '@/components/PlayFrame';
import { PlaySession } from '@/components/PlaySession';
import { ReportButton } from '@/components/ReportButton';
import { RemixButton } from '@/components/RemixButton';
import { viewerId } from '@/lib/identity';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MODES = new Set(['play', 'preview', 'test']);

/**
 * Plays a game's head version from the store; the sample bundle under /public/bundles/sample stays reachable by id.
 * A suspended game plays only for its owner and moderators (without a recorded session); a removed game for nobody.
 */
export default async function PlayPage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const q = await searchParams;
  const modeRaw = typeof q['mode'] === 'string' ? q['mode'] : 'play';
  const mode = (MODES.has(modeRaw) ? modeRaw : 'play') as 'play' | 'preview' | 'test';
  const seedRaw = typeof q['seed'] === 'string' ? Number(q['seed']) : NaN;
  const seed = Number.isInteger(seedRaw) ? seedRaw : undefined;
  const safeId = /^[a-z0-9-]{1,64}$/.test(gameId) ? gameId : 'sample';
  const srcRaw = typeof q['src'] === 'string' ? q['src'] : 'direct';
  const source: PlaySource = (PLAY_SOURCES as readonly string[]).includes(srcRaw) ? (srcRaw as PlaySource) : 'direct';
  let title = safeId;
  let bundleUrl = `/bundles/${safeId}/index.html`;
  let session: { versionId: string; levels: number } | null = null;
  const store = getStore();
  const game = await store.getGame(safeId).catch(() => null);
  if (game?.headVersionId) {
    const head = await store.getVersion(game.headVersionId);
    const base = bundleBaseUrl(head?.bundlePath ?? null);
    if (base && head) {
      bundleUrl = `${base}/index.html`;
      title = game.title;
      const levels = Number((head.design as { gdd?: { scope?: { levels?: number } } }).gdd?.scope?.levels ?? 1);
      session = { versionId: head.id, levels: Number.isFinite(levels) && levels > 0 ? levels : 1 };
    }
  }
  const me = await viewerId();
  const moderated = game?.state === 'removed' || game?.state === 'suspended';
  if (game && moderated && (game.state === 'removed' || (game.ownerId !== me && !(await store.isModerator(me))))) {
    return (
      <main>
        <h1>{game.title}</h1>
        <p className="muted" data-testid="moderated" data-state={game.state}>
          {game.state === 'removed' ? 'This game was removed by moderation.' : 'This game is hidden while moderators review reports about it.'}
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>
        {title} {game?.headVersionId && !moderated ? <RemixButton gameId={game.id} /> : null}
      </h1>
      {moderated ? (
        <p className="err" data-testid="moderated" data-state={game.state}>
          Suspended pending review: only its owner and moderators can open it, and plays are not recorded.
        </p>
      ) : null}
      {session && game && mode === 'play' && !moderated ? (
        <>
          <PlaySession gameId={game.id} versionId={session.versionId} bundleUrl={bundleUrl} source={source} levels={session.levels} seed={seed} rating />
          {game.ownerId !== me ? <ReportButton gameId={game.id} /> : null}
        </>
      ) : (
        <PlayFrame bundleUrl={bundleUrl} mode={mode} seed={seed} />
      )}
    </main>
  );
}
