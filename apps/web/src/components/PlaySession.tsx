'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { PLAY_EVENT_LIMITS, type GameToHost, type PlayEvent, type PlaySource, type RatingTag } from '@gg/schemas';
import { PlayFrame } from '@/components/PlayFrame';

const TAGS: Array<{ tag: RatingTag; label: string; hint: string }> = [
  { tag: 'fun', label: 'Fun', hint: 'I would play more' },
  { tag: 'confusing', label: 'Confusing', hint: 'I did not get it' },
  { tag: 'broken', label: 'Broken', hint: 'something failed' },
  { tag: 'ugly', label: 'Ugly', hint: 'it looks off' },
];

export interface SessionStats {
  activeS: number;
  levelsCompleted: number;
  deaths: number;
}

export interface PlaySessionHandle {
  /** Records the play now (once) and resolves whether it was stored; the tester desk does this before its report. */
  flush(): Promise<boolean>;
}

/**
 * Plays a version and records the session: seconds while the game is ready and the tab visible, levels completed and
 * player deaths from the bridge events, and the creator's heatmap events (where the player died, where they were every
 * few seconds, and where they left an unfinished game). The play is sent once: on pagehide (sendBeacon), on unmount, or
 * when the caller flushes it. One-tag rating below.
 */
export function PlaySession({ gameId, versionId, bundleUrl, source, levels, seed, rating, onStats, ref }: { gameId: string; versionId: string; bundleUrl: string; source: PlaySource; levels: number; seed?: number; rating?: boolean; onStats?: (s: SessionStats) => void; ref?: Ref<PlaySessionHandle> }) {
  const stats = useRef<SessionStats>({ activeS: 0, levelsCompleted: 0, deaths: 0 });
  const events = useRef<PlayEvent[]>([]);
  const counts = useRef({ sample: 0, death: 0 });
  // The player's last known level and position (from state samples), for the quit point.
  const where = useRef<{ level: string; x: number; y: number } | null>(null);
  const ready = useRef(false);
  const sent = useRef(false);
  const [tag, setTag] = useState<RatingTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The parent's stats callback changes every render; the session effect must not restart (its cleanup sends the play).
  const onStatsRef = useRef(onStats);
  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  /** The play as /api/plays takes it, or null when there is nothing to send (already sent, or under a second played). */
  const take = useCallback((): string | null => {
    const s = stats.current;
    if (sent.current || s.activeS < 1) return null;
    sent.current = true;
    const t = Math.round(s.activeS * 10) / 10;
    const completed = s.levelsCompleted >= Math.max(1, levels);
    const quit: PlayEvent[] = !completed && where.current ? [{ kind: 'quit', ...where.current, t }] : [];
    return JSON.stringify({ gameId, versionId, source, durationS: t, completed, levelsCompleted: s.levelsCompleted, deaths: s.deaths, events: [...events.current, ...quit] });
  }, [gameId, versionId, source, levels]);

  const report = useCallback(() => {
    const body = take();
    if (!body) return;
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/plays', blob)) void fetch('/api/plays', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
  }, [take]);

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        if (sent.current) return true;
        const body = take();
        if (!body) return false;
        const ok = await fetch('/api/plays', { method: 'POST', body, headers: { 'content-type': 'application/json' } }).then(
          (res) => res.ok,
          () => false,
        );
        // Not stored: a retry, or the pagehide beacon, sends it again.
        if (!ok) sent.current = false;
        return ok;
      },
    }),
    [take],
  );

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
    const t = Math.round(stats.current.activeS * 10) / 10;
    if (msg.type === 'ready') ready.current = true;
    else if (msg.type === 'state') {
      const p = msg.state.player as { x?: unknown; y?: unknown; alive?: unknown };
      if (!msg.state.level || typeof p.x !== 'number' || typeof p.y !== 'number') return;
      where.current = { level: msg.state.level, x: Math.round(p.x), y: Math.round(p.y) };
      if (p.alive !== false && counts.current.sample < PLAY_EVENT_LIMITS.samples) {
        counts.current.sample++;
        events.current.push({ kind: 'sample', ...where.current, t });
      }
    } else if (msg.type === 'event' && msg.name === 'level_complete') {
      stats.current.levelsCompleted++;
      // Until the next sample, the player is somewhere in the next level.
      where.current = null;
    } else if (msg.type === 'event' && msg.name === 'death' && msg.payload['type'] === 'player') {
      stats.current.deaths++;
      // Newer engines name the level in the event; older bundles fall back to the last sample's level.
      const level = typeof msg.payload['level'] === 'string' && msg.payload['level'] ? msg.payload['level'] : where.current?.level;
      const { x, y } = msg.payload;
      if (level && typeof x === 'number' && typeof y === 'number' && counts.current.death < PLAY_EVENT_LIMITS.deaths) {
        counts.current.death++;
        events.current.push({ kind: 'death', level, x: Math.round(x), y: Math.round(y), t });
      }
    }
  }, []);

  async function rate(t: RatingTag) {
    setError(null);
    const res = await fetch(`/api/games/${gameId}/rate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag: t }) });
    if (res.ok) setTag(t);
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'rating failed');
  }

  return (
    <div className="session">
      <PlayFrame bundleUrl={bundleUrl} mode="play" seed={seed} onMessage={onMessage} sampleStateMs={PLAY_EVENT_LIMITS.sampleEveryS * 1000} />
      {rating ? (
        <div className="panel rate" data-testid="rate">
          <h2>How was it?</h2>
          <div className="rate-options">
            {TAGS.map((t) => (
              <button key={t.tag} aria-pressed={tag === t.tag} onClick={() => void rate(t.tag)} data-testid={`rate-${t.tag}`}>
                <strong>{t.label}</strong>
                <span className="muted small">{t.hint}</span>
              </button>
            ))}
          </div>
          {tag ? (
            <p className="muted small rate-note" data-testid="rated">
              rated: {tag} · you can change it any time
            </p>
          ) : (
            <p className="muted small rate-note">Pick the one word that fits best.</p>
          )}
          {error ? <p className="err small">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
