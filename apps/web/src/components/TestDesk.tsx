'use client';

import { useCallback, useState } from 'react';
import type { RatingTag, TestVerdict } from '@gg/schemas';
import { PlaySession, type SessionStats } from '@/components/PlaySession';

interface Claim {
  assignment: { id: string; gameId: string; versionId: string; expiresAt: string };
  queue: { rewardCredits: number; needed: number };
  game: { id: string; title: string; genre: string } | null;
  bundleBase: string | null;
  credits: number;
}

const MIN_PLAY_S = 30;

/** The rewarded test queue: claim an unreleased game, play it for at least 30 s, report works or broken with one tag. */
export function TestDesk() {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [played, setPlayed] = useState(0);
  const [verdict, setVerdict] = useState<TestVerdict>('works');
  const [tag, setTag] = useState<RatingTag>('fun');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const onStats = useCallback((s: SessionStats) => setPlayed(Math.floor(s.activeS)), []);

  async function claimNext() {
    setError(null);
    setMessage(null);
    setPlayed(0);
    const res = await fetch('/api/tests/claim', { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as Claim & { error?: string };
    if (!res.ok) {
      setClaim(null);
      setMessage(data.error ?? 'nothing to test');
      return;
    }
    setClaim(data);
    setCredits(data.credits);
  }

  async function submit() {
    if (!claim) return;
    setBusy(true);
    setError(null);
    // The test play is recorded first: the report is only accepted after a 30 s play of this version.
    await fetch('/api/plays', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId: claim.assignment.gameId, versionId: claim.assignment.versionId, source: 'test', durationS: played, completed: false, levelsCompleted: 0, deaths: 0 }) });
    const res = await fetch(`/api/tests/${claim.assignment.id}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verdict, tag, note }) });
    const data = (await res.json().catch(() => ({}))) as { credits?: number; error?: string; assignment?: { rewardPaid: number } };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'report failed');
      return;
    }
    setCredits(data.credits ?? null);
    setMessage(`Report sent: ${verdict}, ${tag}. ${data.assignment?.rewardPaid ?? 0} credits paid.`);
    setClaim(null);
  }

  return (
    <div className="testdesk" data-testid="test-desk">
      <p className="muted">
        Unreleased games wait here for players. Play one for at least {MIN_PLAY_S} seconds, say whether it works and the one word that fits, and earn
        credits. {credits !== null ? <span data-testid="credits">Balance: {credits} credits.</span> : null}
      </p>
      {!claim ? (
        <div className="row">
          <button onClick={() => void claimNext()} data-testid="claim-test">
            Claim a game to test
          </button>
        </div>
      ) : null}
      {message ? <p data-testid="test-message">{message}</p> : null}
      {claim && claim.bundleBase ? (
        <>
          <h2>
            Testing: {claim.game?.title ?? claim.assignment.gameId} <span className="muted">({claim.game?.genre}, {claim.queue.rewardCredits} credits)</span>
          </h2>
          <PlaySession key={claim.assignment.id} gameId={claim.assignment.gameId} versionId={claim.assignment.versionId} bundleUrl={`${claim.bundleBase}/index.html`} source="test" levels={1} onStats={onStats} autoReport={false} />
          <div className="panel" data-testid="test-report">
            <h2>Report</h2>
            <p className="muted" data-testid="played">
              played {played} s{played < MIN_PLAY_S ? ` (report opens at ${MIN_PLAY_S} s)` : ''}
            </p>
            <div className="row">
              <label className="check">
                <input type="radio" name="verdict" checked={verdict === 'works'} onChange={() => setVerdict('works')} data-testid="verdict-works" /> works
              </label>
              <label className="check">
                <input type="radio" name="verdict" checked={verdict === 'broken'} onChange={() => setVerdict('broken')} data-testid="verdict-broken" /> broken
              </label>
              <select value={tag} onChange={(e) => setTag(e.target.value as RatingTag)} data-testid="test-tag" className="entity-type">
                {(['fun', 'confusing', 'broken', 'ugly'] as const).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="what happened (optional)" maxLength={500} />
            <div className="row">
              <button disabled={busy || played < MIN_PLAY_S} onClick={() => void submit()} data-testid="submit-test">
                Send report
              </button>
            </div>
            {error ? <p className="err">{error}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
