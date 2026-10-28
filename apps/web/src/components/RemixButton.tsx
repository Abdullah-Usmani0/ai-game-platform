'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Forks the game's head version into a new game of the caller's and opens its workspace. */
export function RemixButton({ gameId, disabled }: { gameId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remix() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/${gameId}/remix`, { method: 'POST' });
    const data = (await res.json()) as { gameId?: string; error?: string };
    setBusy(false);
    if (!res.ok || !data.gameId) {
      setError(data.error ?? 'remix failed');
      return;
    }
    router.push(`/games/${data.gameId}`);
  }
  return (
    <span>
      <button onClick={remix} disabled={disabled || busy} data-testid="remix">
        {busy ? 'Remixing…' : 'Remix'}
      </button>
      {error ? <span className="err"> {error}</span> : null}
    </span>
  );
}
