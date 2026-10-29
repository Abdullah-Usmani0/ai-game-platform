'use client';

import { useEffect, useState } from 'react';

/**
 * The owner's appeal of a removal. For an ip takedown it is a DMCA counter-notice: a statement under penalty of
 * perjury, name and contact, and consent to jurisdiction; the game can come back 14 days after it is filed.
 */
export function AppealForm({ gameId, counterNotice, onSent }: { gameId: string; counterNotice: boolean; onSent: () => void }) {
  const [statement, setStatement] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set once the form is mounted and its handlers are live (the check waits for it before typing).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/${gameId}/appeal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ statement, name, email, consent }) });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string | string[] };
      setError(Array.isArray(data.error) ? data.error.join('; ') : (data.error ?? 'appeal failed'));
      return;
    }
    onSent();
  }

  return (
    <div className="appeal" data-testid="appeal-form" data-ready={ready ? 'yes' : 'no'}>
      <h3>{counterNotice ? 'Counter-notice' : 'Appeal the removal'}</h3>
      <p className="muted small">
        {counterNotice
          ? 'If you believe the game was removed by mistake or misidentification, say so here. Moderators can restore it 14 days after you file, unless the claimant takes the matter to court in that time.'
          : 'Tell the moderators why the game should come back. They decide as soon as they read it.'}
      </p>
      <textarea rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} placeholder={counterNotice ? 'I state under penalty of perjury that I have a good faith belief the game was removed as a result of mistake or misidentification, because…' : 'why the game should come back'} maxLength={2000} data-testid="appeal-statement" />
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your full name" aria-label="name" data-testid="appeal-name" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact email" aria-label="email" type="email" data-testid="appeal-email" />
      </div>
      {counterNotice ? (
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="appeal-consent" /> I consent to the jurisdiction of the courts for my address and will accept service of process from the person who reported the game.
        </label>
      ) : null}
      <div className="row">
        <button onClick={() => void send()} disabled={busy || statement.length < 20 || !name || !email || (counterNotice && !consent)} data-testid="appeal-send">
          {counterNotice ? 'File the counter-notice' : 'Send the appeal'}
        </button>
      </div>
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}
