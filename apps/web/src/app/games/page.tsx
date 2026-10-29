import Link from 'next/link';
import { GameCard } from '@/components/GameCard';
import { Icon } from '@/components/Icon';
import { TrainingConsent } from '@/components/TrainingConsent';
import { cap } from '@/lib/text';
import { viewerId } from '@/lib/identity';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

const STATE_TONE: Record<string, string> = { draft: 'neutral', generating: 'brand', playable: 'ok', published: 'ok', suspended: 'warn', removed: 'err' };

export default async function GamesPage() {
  const store = getStore();
  const games = await store.listGames({ ownerId: await viewerId(), limit: 50 });
  const heads = await Promise.all(games.map((g) => (g.headVersionId ? store.getVersion(g.headVersionId).catch(() => null) : Promise.resolve(null))));
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Your games</h1>
          <p className="muted">Everything you have made or remixed. Open one to watch it build, play it, tune it or publish it.</p>
        </div>
        <Link className="btn btn-primary" href="/create">
          <Icon name="plus" /> New game
        </Link>
      </div>
      {games.length === 0 ? (
        <div className="empty">
          <strong>No games yet</strong>
          <span>Describe one and the harness builds it.</span>
          <Link className="btn btn-primary" href="/create">
            Create a game
          </Link>
        </div>
      ) : (
        <ul className="game-grid">
          {games.map((g, i) => {
            const head = heads[i];
            const base = bundleBaseUrl(head?.bundlePath ?? null);
            const thumb = (head?.design as { evidence?: { thumbnail?: string | null } } | undefined)?.evidence?.thumbnail;
            const listed = g.visibility === 'listed';
            return (
              <GameCard
                key={g.id}
                gameId={g.id}
                href={`/games/${g.id}`}
                title={g.title}
                genre={g.genre}
                cover={base && thumb ? `${base}/${thumb}` : null}
                status={
                  <span className="pill" data-tone={STATE_TONE[g.state] ?? 'neutral'}>
                    {cap(g.state)}
                  </span>
                }
                meta={[
                  { icon: 'clock', text: `updated ${new Date(g.updatedAt).toLocaleDateString()}` },
                  ...(head ? [{ icon: 'flag' as const, text: `version ${head.number}` }] : []),
                  ...(listed ? [{ icon: 'eye' as const, text: 'in the feed' }] : []),
                ]}
              />
            );
          })}
        </ul>
      )}
      <div className="section-head">
        <h2>Training data</h2>
      </div>
      <div className="panel">
        <TrainingConsent />
      </div>
    </main>
  );
}
