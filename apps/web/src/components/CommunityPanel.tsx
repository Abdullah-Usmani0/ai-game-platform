'use client';

import { useCallback, useEffect, useState } from 'react';

interface CommunityView {
  isOwner: boolean;
  visibility: string;
  state: string;
  tested: { outcome?: string; versionId?: string } | null;
  stats: { players: number; qualifiedPlayers: number; completionRate: number; avgPlayMin: number; ratings: Record<string, number>; ratingCount: number; remixes: number; rankScore: number; broken: boolean };
  tests: Array<{ id: string; status: string; outcome: string | null; needed: number; submitted: number; rewardCredits: number; verdicts: Array<{ verdict: string; tag: string; note: string }> }>;
}

/** Listing, community stats and test rounds of a game, in the creator's workspace. */
export function CommunityPanel({ gameId, hasHead }: { gameId: string; hasHead: boolean }) {
  const [view, setView] = useState<CommunityView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}/community`, { cache: 'no-store' });
    if (res.ok) setView((await res.json()) as CommunityView);
  }, [gameId]);
  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/${gameId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${path} failed`);
    setBusy(false);
    await refresh();
  }

  if (!view) return null;
  const s = view.stats;
  const listed = view.visibility === 'listed';
  const open = view.tests.find((t) => t.status === 'open');
  const last = [...view.tests].reverse().find((t) => t.status === 'closed');
  return (
    <div className="panel" data-testid="community" data-listed={listed ? 'yes' : 'no'}>
      <h2>Community</h2>
      <p className="muted">
        {listed ? 'Listed in the feed' : 'Not listed'} · {s.players} player(s), {s.qualifiedPlayers} played 30 s+ · {Math.round(s.completionRate * 100)}% finish · {s.avgPlayMin.toFixed(1)} min avg · rank {s.rankScore.toFixed(3)}
        {s.broken ? <span className="err"> · marked broken</span> : null}
      </p>
      <p className="muted">
        ratings: fun {s.ratings['fun'] ?? 0} · confusing {s.ratings['confusing'] ?? 0} · broken {s.ratings['broken'] ?? 0} · ugly {s.ratings['ugly'] ?? 0} · remixes {s.remixes}
      </p>
      {open ? (
        <p data-testid="test-status">
          testers: {open.submitted}/{open.needed} reports in (reward {open.rewardCredits} credits each)
        </p>
      ) : last ? (
        <p data-testid="test-status">
          last test round: <strong className={last.outcome === 'works' ? 'ok' : 'err'}>{last.outcome}</strong> ({last.verdicts.map((v) => `${v.verdict}/${v.tag}`).join(', ')})
        </p>
      ) : null}
      {view.isOwner ? (
        <div className="row">
          <button disabled={busy || !hasHead} onClick={() => void post('publish', { listed: !listed })} data-testid="publish">
            {listed ? 'Unlist' : 'Publish to the feed'}
          </button>
          <button disabled={busy || !hasHead || Boolean(open)} onClick={() => void post('tests', { needed: 3, rewardCredits: 5 })} data-testid="ask-testers">
            Ask 3 testers (5 credits each)
          </button>
        </div>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}
