import Link from 'next/link';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The feed: listed games that passed their gates and are not broken, ranked per player (see @gg/db ranking). */
export default async function Home() {
  const items = await getStore().listFeed({ limit: 50 });
  return (
    <main>
      <h1>Play</h1>
      <p className="muted">
        Games made on the platform. Each one passed every gate before it could be listed: bots finished it, the replay matched, budgets held. <Link href="/create">Make one</Link>.
      </p>
      {items.length === 0 ? <p className="muted" data-testid="feed-empty">Nothing is listed yet. Publish a game from its workspace.</p> : null}
      <ul className="feed" data-testid="feed">
        {items.map(({ game, head, stats }, i) => {
          const base = bundleBaseUrl(head.bundlePath);
          const thumb = (head.design as { evidence?: { thumbnail?: string | null } }).evidence?.thumbnail;
          const tested = (game.listing as { tested?: { outcome?: string } }).tested;
          return (
            <li key={game.id} className="card" data-testid="feed-item" data-game={game.id}>
              <Link href={`/play/${game.id}?src=feed`} className="thumb">
                {base && thumb ? <img src={`${base}/${thumb}`} alt="" /> : <span className="muted">{game.genre}</span>}
              </Link>
              <div>
                <Link href={`/play/${game.id}?src=feed`}>
                  <strong>
                    {i + 1}. {game.title}
                  </strong>
                </Link>
                <div className="muted small">
                  {game.genre} · {stats.players} player{stats.players === 1 ? '' : 's'} · {Math.round(stats.completionRate * 100)}% finish · fun {stats.ratings.fun}
                  {stats.remixes ? ` · ${stats.remixes} remix${stats.remixes === 1 ? '' : 'es'}` : ''}
                  {tested?.outcome === 'works' ? <span className="ok"> · tested</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
