import Link from 'next/link';
import { jamPhase } from '@gg/db';
import { GameCard } from '@/components/GameCard';
import { Icon } from '@/components/Icon';
import { GENRES, genreLabel } from '@/lib/genres';
import { utc } from '@/lib/jam-format';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The front page: what the platform does, a live jam if there is one, and the feed (ranked per player, see @gg/db ranking). */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const genre = typeof q['genre'] === 'string' && GENRES.some((g) => g.id === q['genre']) ? q['genre'] : null;
  const store = getStore();
  const [items, jams] = await Promise.all([store.listFeed({ limit: 60 }), store.listJams().catch(() => [])]);
  const shown = genre ? items.filter((i) => i.game.genre === genre) : items;
  const live = jams.map((j) => ({ ...j, phase: jamPhase(j) })).find((j) => j.phase === 'open' || j.phase === 'voting');
  const genresInFeed = GENRES.filter((g) => items.some((i) => i.game.genre === g.id));
  return (
    <main>
      <section className="hero">
        <div className="rise">
          <div className="eyebrow">
            <Icon name="spark" /> Made by players, built by an AI harness
          </div>
          <h1>
            <span className="gradient-text">Describe a game.</span>
            <br />
            Play it in minutes.
          </h1>
          <p className="lead">Pick a genre and say what you want. The harness designs it, builds it and plays it with bots, and publishes only when every check passes. Then anyone can play it, rate it and remix it.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" href="/create">
              Create a game
            </Link>
            <a className="btn btn-lg" href="#games">
              Browse games
            </a>
          </div>
          <div className="hero-points">
            <span>
              <Icon name="check" /> {GENRES.length} genres
            </span>
            <span>
              <Icon name="check" /> Every game bot-tested
            </span>
            <span>
              <Icon name="check" /> Remix anything
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          {['platformer', 'topdown-action', 'shmup'].map((id) => (
            <div className="shot" key={id}>
              <img src={`/genres/${id}.png`} alt="" width={320} height={180} />
            </div>
          ))}
        </div>
      </section>

      {live ? (
        <Link href={`/jams/${live.slug}`} className="callout jam-banner card-link" data-tone="info">
          <strong>{live.title}</strong> · theme &ldquo;{live.theme}&rdquo; · {live.phase === 'open' ? `entries close ${utc(live.submissionsClose)}` : `voting closes ${utc(live.votingClose)}`} <span className="spacer" /> View the jam →
        </Link>
      ) : null}

      <div className="section-head" id="games">
        <h2>{genre ? genreLabel(genre) : 'Top games'}</h2>
        {genresInFeed.length > 1 ? (
          <nav className="filters" aria-label="Genres">
            <Link className="filter" href="/#games" aria-current={genre === null ? 'true' : undefined}>
              All
            </Link>
            {genresInFeed.map((g) => (
              <Link key={g.id} className="filter" href={`/?genre=${g.id}#games`} aria-current={genre === g.id ? 'true' : undefined}>
                {g.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <div className="empty" data-testid="feed-empty">
          <strong>Nothing is listed yet</strong>
          <span>Games appear here once their creators publish them from the workspace.</span>
          <Link className="btn btn-primary" href="/create">
            Make the first one
          </Link>
        </div>
      ) : null}
      <ul className="game-grid" data-testid="feed">
        {shown.map(({ game, head, stats }, i) => {
          const base = bundleBaseUrl(head.bundlePath);
          const thumb = (head.design as { evidence?: { thumbnail?: string | null } }).evidence?.thumbnail;
          const tested = (game.listing as { tested?: { outcome?: string } }).tested;
          return (
            <GameCard
              key={game.id}
              testId="feed-item"
              gameId={game.id}
              href={`/play/${game.id}?src=feed`}
              title={game.title}
              genre={game.genre}
              cover={base && thumb ? `${base}/${thumb}` : null}
              rank={genre ? undefined : i + 1}
              meta={[
                { icon: 'user', text: `${stats.players} player${stats.players === 1 ? '' : 's'}` },
                { icon: 'flag', text: `${Math.round(stats.completionRate * 100)}% finish` },
                { icon: 'heart', text: `${stats.ratings.fun} fun` },
                ...(stats.remixes ? [{ icon: 'remix' as const, text: `${stats.remixes} remix${stats.remixes === 1 ? '' : 'es'}` }] : []),
              ]}
              badge={tested?.outcome === 'works' ? 'tested' : undefined}
            />
          );
        })}
      </ul>
    </main>
  );
}
