import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>AI Game Platform</h1>
      <p>Describe a 2D game; a verified harness builds it, plays it with bots and publishes it only when every gate passes.</p>
      <ul>
        <li>
          <Link href="/create">Create a game</Link>
        </li>
        <li>
          <Link href="/games">Your games</Link>
        </li>
        <li>
          <Link href="/play/sample">Play the sample platformer</Link>
        </li>
      </ul>
    </main>
  );
}
