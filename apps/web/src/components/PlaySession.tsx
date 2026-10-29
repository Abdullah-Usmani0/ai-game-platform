'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameToHost, PlaySource, RatingTag } from '@gg/schemas';
import { PlayFrame } from '@/components/PlayFrame';

const TAGS: Array<{ tag: RatingTag; label: string }> = [
  { tag: 'fun', label: 'Fun' },
  { tag: 'confusing', label: 'Confusing' },
  { tag: 'broken', label: 'Broken' },
  { tag: 'ugly', label: 'Ugly' },
];

export interface SessionStats {
  activeS: number;
  levelsCompleted: number;
  deaths: number;
}

/**
 * Plays a version and records the session: seconds while the game is ready and the tab visible, levels completed and
 * player deaths from the bridge events. The play is sent once, on pagehide (sendBeacon) or unmount. One-tag rating below.
 */
export function PlaySession({ gameId, versionId, bundleUrl, source, levels, seed, rating, onStats, autoReport = true }: { gameId: string; versionId: string; bundleUrl: string; source: PlaySource; levels: number; seed?: number; rating?: boolean; onStats?: (s: SessionStats) => void; /** false: the caller records the play itself (the tester desk, before its report). */ autoReport?: boolean }) {
  const stats = useRef<SessionStats>({ activeS: 0, levelsCompleted: 0, deaths: 0 });
  const ready = useRef(false);
  const sent = useRef(false);
  const [tag, setTag] = useState<RatingTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The parent's stats callback changes every render; the session effect must not restart (its cleanup sends the play).
  const onStatsRef = useRef(onStats);
  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  const report = useCallback(() => {
    const s = stats.current;
    if (!autoReport || sent.current || s.activeS < 1) return;
    sent.current = true;
    const body = JSON.stringify({ gameId, versionId, source, durationS: Math.round(s.activeS * 10) / 10, completed: s.levelsCompleted >= Math.max(1, levels), levelsCompleted: s.levelsCompleted, deaths: s.deaths });
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/plays', blob)) void fetch('/api/plays', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
  }, [gameId, versionId, source, levels, autoReport]);

  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (ready.current && document.visibilityState === 'visible') stats.current.activeS += (now - last) / 1000;
      last = now;
      onStatsRef.current?.({ ...stats.current });
    }, 250);
    const onHide = () => report();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      report();
    };
  }, [report]);

  const onMessage = useCallback((msg: GameToHost) => {
    if (msg.type === 'ready') ready.current = true;
    else if (msg.type === 'event' && msg.name === 'level_complete') stats.current.levelsCompleted++;
    else if (msg.type === 'event' && msg.name === 'death' && msg.payload['type'] === 'player') stats.current.deaths++;
  }, []);

  async function rate(t: RatingTag) {
    setError(null);
    const res = await fetch(`/api/games/${gameId}/rate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag: t }) });
    if (res.ok) setTag(t);
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'rating failed');
  }

  return (
    <div className="session">
      <PlayFrame bundleUrl={bundleUrl} mode="play" seed={seed} onMessage={onMessage} />
      {rating ? (
        <div className="panel rate" data-testid="rate">
          <h2>One word for it</h2>
          <div className="row">
            {TAGS.map((t) => (
              <button key={t.tag} className={`tool${tag === t.tag ? ' selected' : ''}`} onClick={() => void rate(t.tag)} data-testid={`rate-${t.tag}`}>
                {t.label}
              </button>
            ))}
          </div>
          {tag ? <p className="muted" data-testid="rated">rated: {tag}</p> : <p className="muted">Pick the one that fits best; you can change it later.</p>}
          {error ? <p className="err">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
