import Link from 'next/link';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function GamesPage() {
  const games = await getStore().listGames({ limit: 50 });
  return (
    <main>
      <h1>Games</h1>
      <p>
        <Link href="/create">Create a new game</Link>
      </p>
      {games.length === 0 ? <p className="muted">No games yet.</p> : null}
      <ul className="games">
        {games.map((g) => (
          <li key={g.id}>
            <Link href={`/games/${g.id}`}>{g.title}</Link> <span className="muted">
              {g.genre} · {g.state} · {new Date(g.updatedAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
