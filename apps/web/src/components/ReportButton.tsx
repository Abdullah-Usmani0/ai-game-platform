'use client';

import { useState } from 'react';
import type { ReportKind } from '@gg/schemas';

const KINDS: Array<{ kind: ReportKind; label: string }> = [
  { kind: 'broken', label: 'It does not work' },
  { kind: 'abuse', label: 'Offensive or abusive' },
  { kind: 'ip', label: 'Copies my work (copyright or trademark)' },
  { kind: 'other', label: 'Something else' },
];

/** Report a game to the moderators. Reports from three players suspend a game until it is reviewed. */
export function ReportButton({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind>('broken');
  const [note, setNote] = useState('');
  const [rightsHolder, setRightsHolder] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const res = await fetch(`/api/games/${gameId}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, note, rightsHolder: kind === 'ip' && rightsHolder }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; suspended?: boolean };
    if (!res.ok) {
      setError(data.error ?? 'report failed');
      return;
    }
    setDone(data.suspended ? 'Thanks. The game is hidden until a moderator reviews it.' : 'Thanks. A moderator will review it.');
    setOpen(false);
  }

  return (
    <div className="report-game" data-testid="report">
      {!open ? (
        <button className="link" onClick={() => setOpen(true)} data-testid="report-open">
          Report this game
        </button>
      ) : (
        <div className="panel">
          <h2>Report</h2>
          {KINDS.map((k) => (
            <label key={k.kind} className="check">
              <input type="radio" name="report-kind" checked={kind === k.kind} onChange={() => setKind(k.kind)} data-testid={`report-${k.kind}`} /> {k.label}
            </label>
          ))}
          {kind === 'ip' ? (
            <label className="check">
              <input type="checkbox" checked={rightsHolder} onChange={(e) => setRightsHolder(e.target.checked)} /> I hold the rights to the work
            </label>
          ) : null}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="what is wrong (optional)" maxLength={1000} />
          <div className="row">
            <button onClick={() => void send()} data-testid="report-send">
              Send report
            </button>
            <button onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {done ? <p className="muted" data-testid="report-done">{done}</p> : null}
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}
