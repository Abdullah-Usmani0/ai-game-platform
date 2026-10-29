import Link from 'next/link';
import { PLAY_SOURCES, type PlaySource } from '@gg/schemas';
import { Icon } from '@/components/Icon';
import { PlayFrame } from '@/components/PlayFrame';
import { PlaySession } from '@/components/PlaySession';
import { ReportButton } from '@/components/ReportButton';
import { RemixButton } from '@/components/RemixButton';
import { GENRE_BY_ID, genreLabel } from '@/lib/genres';
import { viewerId } from '@/lib/identity';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MODES = new Set(['play', 'preview', 'test']);

/**
 * Plays a game's head version from the store, or with ?version= one of its earlier accepted versions (a jam links the
 * version that was entered); the sample bundle under /public/bundles/sample stays reachable by id. A suspended game
 * plays only for its owner and moderators (without a recorded session); a removed game for nobody.
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
  let session: { versionId: string; number: number; levels: number } | null = null;
  const store = getStore();
  const game = await store.getGame(safeId).catch(() => null);
  const asked = typeof q['version'] === 'string' ? q['version'] : null;
  if (game?.headVersionId) {
    const pick = asked ? await store.getVersion(asked).catch(() => null) : null;
    // Only an accepted version of this game; anything else plays the head.
    const head = pick && pick.gameId === game.id && pick.kind !== 'stage' ? pick : await store.getVersion(game.headVersionId);
    const base = bundleBaseUrl(head?.bundlePath ?? null);
    if (base && head) {
      bundleUrl = `${base}/index.html`;
      title = game.title;
      const levels = Number((head.design as { gdd?: { scope?: { levels?: number } } }).gdd?.scope?.levels ?? 1);
      session = { versionId: head.id, number: head.number, levels: Number.isFinite(levels) && levels > 0 ? levels : 1 };
    }
  }
  const me = await viewerId();
  const moderated = game?.state === 'removed' || game?.state === 'suspended';
  if (game && moderated && (game.state === 'removed' || (game.ownerId !== me && !(await store.isModerator(me))))) {
    return (
      <main>
        <div className="empty">
          <strong>{game.title}</strong>
          <span data-testid="moderated" data-state={game.state}>
            {game.state === 'removed' ? 'This game was removed by moderation.' : 'This game is hidden while moderators review reports about it.'}
          </span>
          <Link className="btn" href="/">
            Back to the games
          </Link>
        </div>
      </main>
    );
  }
  const info = game ? GENRE_BY_ID[game.genre] : undefined;
  const stats = game ? await store.gameStats(game.id).catch(() => null) : null;
  const originVersion = game?.originVersionId ? await store.getVersion(game.originVersionId).catch(() => null) : null;
  const origin = originVersion ? await store.getGame(originVersion.gameId).catch(() => null) : null;
  return (
    <main>
      <div className="play-layout">
        <div className="stage">
          {moderated ? (
            <div className="callout" data-tone="err" data-testid="moderated" data-state={game?.state}>
              Suspended pending review: only its owner and moderators can open it, and plays are not recorded.
            </div>
          ) : null}
          {session && game && mode === 'play' && !moderated ? (
            <PlaySession gameId={game.id} versionId={session.versionId} bundleUrl={bundleUrl} source={source} levels={session.levels} seed={seed} rating />
          ) : (
            <PlayFrame bundleUrl={bundleUrl} mode={mode} seed={seed} />
          )}
        </div>
        <aside className="play-info">
          <div className="panel stack">
            <div className="stack-sm">
              <div className="cluster">
                <span className="pill">{game ? genreLabel(game.genre) : 'Sample'}</span>
                {session ? <span className="pill">Version {session.number}</span> : null}
              </div>
              <h1>{title}</h1>
              {game ? (
                <span className="muted small">
                  by <strong>{game.ownerId}</strong>
                  {origin ? (
                    <>
                      {' '}
                      · remix of <Link href={`/play/${origin.id}`}>{origin.title}</Link>
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
            {stats ? (
              <div className="stats">
                <div className="stat">
                  <span className="value">{stats.players}</span>
                  <span className="label">players</span>
                </div>
                <div className="stat">
                  <span className="value">{Math.round(stats.completionRate * 100)}%</span>
                  <span className="label">finish it</span>
                </div>
                <div className="stat">
                  <span className="value">{stats.ratings['fun'] ?? 0}</span>
                  <span className="label">say fun</span>
                </div>
              </div>
            ) : null}
            {game?.headVersionId && !moderated ? (
              <div className="cluster">
                <RemixButton gameId={game.id} />
                {game.ownerId === me ? (
                  <Link className="btn" href={`/games/${game.id}`}>
                    <Icon name="code" /> Open workspace
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          {info ? (
            <div className="panel">
              <h2>Controls</h2>
              <div className="controls-hint">
                {info.controls.map(([keys, action]) => (
                  <span key={keys} style={{ display: 'contents' }}>
                    <kbd>{keys}</kbd>
                    <span>{action}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {session && game && mode === 'play' && !moderated && game.ownerId !== me ? <ReportButton gameId={game.id} /> : null}
        </aside>
      </div>
    </main>
  );
}
