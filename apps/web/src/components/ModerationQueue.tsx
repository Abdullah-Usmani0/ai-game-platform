'use client';

import { useCallback, useEffect, useState } from 'react';

interface ReportView {
  id: string;
  gameId: string;
  reporterId: string;
  kind: string;
  note: string;
  rightsHolder: boolean;
  createdAt: string;
  game: { id: string; title: string; state: string; ownerId: string } | null;
}

/** Moderators: open reports grouped by game, with dismiss, warn, license (ip) and remove. */
export function ModerationQueue() {
  const [reports, setReports] = useState<ReportView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const res = await fetch('/api/reports?status=open', { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as { reports?: ReportView[]; error?: string };
    if (!res.ok) {
      setError(data.error ?? 'cannot load reports');
      setReports([]);
      return;
    }
    setReports(data.reports ?? []);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function resolve(id: string, resolution: string) {
    setError(null);
    const res = await fetch(`/api/reports/${id}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resolution, note: notes[id] ?? '' }) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'resolve failed');
    await refresh();
  }

  if (reports === null) return <p className="muted">Loading reports…</p>;
  const byGame = new Map<string, ReportView[]>();
  for (const r of reports) byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r]);
  return (
    <div className="moderation" data-testid="moderation" data-open={reports.length}>
      {error ? <p className="err">{error}</p> : null}
      {reports.length === 0 && !error ? <p className="muted" data-testid="moderation-empty">No open reports.</p> : null}
      {[...byGame.entries()].map(([gameId, rs]) => (
        <div key={gameId} className="panel" data-testid="moderation-game" data-game={gameId}>
          <h2>
            {rs[0]!.game?.title ?? gameId} <span className="muted">({rs[0]!.game?.state}, {new Set(rs.map((r) => r.reporterId)).size} reporter(s))</span>
          </h2>
          <a href={`/play/${gameId}?src=direct`} target="_blank" rel="noreferrer">
            open the game
          </a>
          <ul className="reports">
            {rs.map((r) => (
              <li key={r.id} data-testid="moderation-report">
                <strong>{r.kind}</strong>
                {r.rightsHolder ? ' (rights holder)' : ''} from {r.reporterId}: {r.note || <span className="muted">no note</span>}
                <div className="row">
                  <input value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="decision note" aria-label="decision note" />
                  <button onClick={() => void resolve(r.id, 'dismiss')} data-testid="resolve-dismiss">
                    Dismiss
                  </button>
                  <button onClick={() => void resolve(r.id, 'unlist')} data-testid="resolve-unlist" title="out of the feed until a fixed version is published; no strike">
                    Unlist until fixed
                  </button>
                  {r.kind !== 'broken' ? (
                    <button onClick={() => void resolve(r.id, 'warn')} data-testid="resolve-warn" title="strike the owner; the game stays">
                      Warn
                    </button>
                  ) : null}
                  {r.kind === 'ip' ? (
                    <button onClick={() => void resolve(r.id, 'license')} data-testid="resolve-license">
                      Licensed
                    </button>
                  ) : null}
                  <button onClick={() => void resolve(r.id, 'remove')} data-testid="resolve-remove" title="take the game and its unedited remixes down, delete its bundle, strike the owner">
                    Remove game
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
