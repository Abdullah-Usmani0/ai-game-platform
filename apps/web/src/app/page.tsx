import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>AI Game Platform</h1>
      <p>Phase 0: a deterministic runtime, a harness with gates, and this play page.</p>
      <ul>
        <li>
          <Link href="/play/sample">Play the sample platformer</Link>
        </li>
        <li>
          <Link href="/play/sample?mode=preview&seed=7">Preview mode (autoplay, seed 7)</Link>
        </li>
      </ul>
    </main>
  );
}
