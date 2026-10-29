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
      as <strong data-testid="identity-name">{me?.userId ?? '…'}</strong> · {me?.credits ?? 0} credits{' '}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="switch user" aria-label="switch user" />
      <button onClick={() => void switchTo()} disabled={!name.trim()}>
        switch
      </button>
    </span>
  );
}
