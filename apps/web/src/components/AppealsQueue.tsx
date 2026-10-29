'use client';

import { useCallback, useEffect, useState } from 'react';

interface AppealView {
  id: string;
  gameId: string;
  ownerId: string;
  statement: string;
  contactName: string;
  contactEmail: string;
  consent: boolean;
  reinstateAfter: string;
  createdAt: string;
  game: { id: string; title: string; state: string } | null;
  takedown: { terms: string; createdAt: string } | null;
  report: { kind: string; note: string; rightsHolder: boolean } | null;
}

/** Moderators: open appeals of removals. A counter-notice can be reinstated only after its 14 days. */
export function AppealsQueue() {
  const [appeals, setAppeals] = useState<AppealView[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const res = await fetch('/api/appeals?status=open', { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as { appeals?: AppealView[]; error?: string };
    if (!res.ok) setError(data.error ?? 'cannot load appeals');
    setAppeals(data.appeals ?? []);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(id: string, decision: 'reinstate' | 'uphold') {
    setError(null);
    const res = await fetch(`/api/appeals/${id}/decide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, note: notes[id] ?? '' }) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'decision failed');
    await refresh();
  }

  if (appeals === null) return null;
  return (
    <div className="moderation" data-testid="appeals" data-open={appeals.length}>
      <h2>Appeals</h2>
      {error ? <p className="err">{error}</p> : null}
      {appeals.length === 0 ? <p className="muted">No open appeals.</p> : null}
      {appeals.map((a) => {
        const counter = a.report?.kind === 'ip';
        const waiting = Date.parse(a.reinstateAfter) > Date.now();
        return (
          <div key={a.id} className="panel" data-testid="appeal" data-game={a.gameId}>
            <h2>
              {a.game?.title ?? a.gameId} <span className="muted">({counter ? 'counter-notice' : 'appeal'} by {a.ownerId})</span>
            </h2>
            <p className="muted small">
              Removed for {a.report?.kind ?? 'a report'}
              {a.takedown?.terms ? `: ${a.takedown.terms}` : ''}. Filed {new Date(a.createdAt).toLocaleString()} by {a.contactName} ({a.contactEmail}){counter ? `, consent to jurisdiction ${a.consent ? 'given' : 'missing'}` : ''}.
            </p>
            <p>{a.statement}</p>
            <div className="row">
              <input value={notes[a.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))} placeholder="decision note" aria-label="decision note" />
              <button onClick={() => void decide(a.id, 'reinstate')} disabled={waiting} title={waiting ? `the claimant has until ${new Date(a.reinstateAfter).toLocaleString()} to go to court` : ''} data-testid="appeal-reinstate">
                {waiting ? `Reinstate from ${new Date(a.reinstateAfter).toLocaleDateString()}` : 'Reinstate'}
              </button>
              <button onClick={() => void decide(a.id, 'uphold')} data-testid="appeal-uphold">
                Uphold the removal
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
