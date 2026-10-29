'use client';

import { useEffect, useState } from 'react';

/**
 * The account's training consent (on unless the player opts out): prompts and the designs that pass their gates may
 * train the platform's own models. Opting out covers every game of theirs, remixes of them included, and deletes what
 * was recorded.
 */
export function TrainingConsent() {
  const [optOut, setOptOut] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch('/api/me', { cache: 'no-store' }).then(async (r) => (r.ok ? setOptOut(((await r.json()) as { trainingOptOut: boolean }).trainingOptOut) : null));
  }, []);
  async function change(consent: boolean) {
    setError('');
    const res = await fetch('/api/me/training', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ optOut: !consent }) });
    const body = (await res.json().catch(() => ({}))) as { trainingOptOut?: boolean; error?: string };
    if (res.ok && typeof body.trainingOptOut === 'boolean') setOptOut(body.trainingOptOut);
    else setError(body.error ?? 'could not save the setting');
  }
  return (
    <div className="training-consent" data-testid="training-consent" data-opt-out={optOut === null ? '' : String(optOut)}>
      <label className="check">
        <input type="checkbox" checked={optOut === false} disabled={optOut === null} onChange={(e) => void change(e.target.checked)} data-testid="training-consent-box" /> Let my
        games teach the platform&apos;s own models: my prompts and the designs that pass every check may become training
        data. Unchecking opts out all my games and their remixes, and deletes what was recorded.
      </label>
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}
