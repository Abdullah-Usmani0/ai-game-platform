'use client';

import { useEffect, useState } from 'react';

/** Local development: act as another user (a player, a tester) to try the community flows. */
export function IdentitySwitch() {
  const [me, setMe] = useState<{ userId: string; credits: number } | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    void fetch('/api/me', { cache: 'no-store' }).then(async (r) => (r.ok ? setMe((await r.json()) as { userId: string; credits: number }) : null));
  }, []);
  async function switchTo() {
    const res = await fetch('/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: name.trim() }) });
    if (res.ok) window.location.reload();
  }
  return (
    <span className="identity" data-testid="identity">
      <span className="who" title={`${me?.credits ?? 0} credits`}>
        <span className="avatar">{(me?.userId ?? '?').slice(0, 1)}</span>
        <strong data-testid="identity-name">{me?.userId ?? '…'}</strong>
        <span className="muted">{me?.credits ?? 0} cr</span>
      </span>
      <form
        className="cluster"
        onSubmit={(e) => {
          e.preventDefault();
          void switchTo();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="switch user" aria-label="switch user" />
        <button type="submit" disabled={!name.trim()}>
          Switch
        </button>
      </form>
    </span>
  );
}
