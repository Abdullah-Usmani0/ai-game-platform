'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameToHost } from '@gg/schemas';
import { BridgeHost } from '@/lib/bridge-host';
import { cap } from '@/lib/text';

export interface PlayFrameProps {
  bundleUrl: string;
  mode: 'play' | 'preview' | 'test';
  seed?: number;
  /** Every validated message from the game (play sessions count deaths and completions from the events). */
  onMessage?: (msg: GameToHost) => void;
  /** Ask the game for its state this often while it runs and the tab is visible (play sessions sample positions). */
  sampleStateMs?: number;
}

type Status = 'loading' | 'hello' | 'ready' | 'error';

const STATUS_TONE: Record<Status, string> = { loading: 'neutral', hello: 'info', ready: 'ok', error: 'err' };

/**
 * A game in its sandboxed frame, with the player's controls under it (pause, sound, full screen). Preview and test
 * modes add the developer tools: the game's state, a screenshot, frame timing and the event log.
 */
export function PlayFrame({ bundleUrl, mode, seed, onMessage, sampleStateMs }: PlayFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<BridgeHost | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [state, setState] = useState<{ tick: number; hash: string; scene: string } | null>(null);
  const [metrics, setMetrics] = useState<{ fps: number; frameMsP95: number } | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const host = new BridgeHost(iframe, {
      mode,
      seed,
      locale: 'en',
      prefs: { reduceShake: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, colorblind: false, mute: false },
      player: { nickname: 'player' },
      limits: { saveBytes: 65536 },
    });
    hostRef.current = host;
    let sampler: number | undefined;
    const offMsg = host.on((msg: GameToHost) => {
      onMessageRef.current?.(msg);
      switch (msg.type) {
        case 'hello':
          setStatus('hello');
          return;
        case 'ready':
          setStatus('ready');
          if (sampleStateMs && sampler === undefined) {
            host.send({ type: 'request_state' });
            sampler = window.setInterval(() => {
              if (document.visibilityState === 'visible') host.send({ type: 'request_state' });
            }, sampleStateMs);
          }
          return;
        case 'error':
          setError(msg.message);
          if (msg.fatal) setStatus('error');
          return;
        case 'event':
          setEvents((prev) => [`t${msg.tick} ${msg.name}`, ...prev].slice(0, 12));
          return;
        case 'state':
          setState({ tick: msg.state.tick, hash: msg.state.hash, scene: msg.state.scene });
          return;
        case 'metrics':
          setMetrics({ fps: Math.round(msg.fps), frameMsP95: Math.round(msg.frameMsP95 * 10) / 10 });
          return;
        case 'screenshot':
          setShot(msg.png);
          return;
        default:
          return;
      }
    });
    const detach = host.attach();
    return () => {
      window.clearInterval(sampler);
      offMsg();
      detach();
      hostRef.current = null;
    };
  }, [mode, seed, bundleUrl, sampleStateMs]);

  const send = (msg: Parameters<BridgeHost['send']>[0]) => hostRef.current?.send(msg);
  const dev = mode !== 'play';
  const togglePause = () => {
    send({ type: paused ? 'resume' : 'pause' });
    setPaused(!paused);
    iframeRef.current?.focus();
  };
  const toggleMute = () => {
    send({ type: 'mute', muted: !muted });
    setMuted(!muted);
    iframeRef.current?.focus();
  };
  const fullscreen = () => void wrapRef.current?.requestFullscreen?.().catch(() => undefined);

  return (
    <div className="stage">
      <div className="frame-wrap" ref={wrapRef}>
        <iframe ref={iframeRef} title="game" src={bundleUrl} sandbox="allow-scripts" allow="autoplay; fullscreen" referrerPolicy="no-referrer" />
        <div className="loading" data-hidden={status === 'ready' ? 'true' : 'false'} aria-hidden="true">
          {status === 'error' ? 'The game stopped with an error.' : 'Loading the game…'}
        </div>
      </div>
      <div className="frame-bar" data-status={status}>
        <span className="pill dot" data-tone={STATUS_TONE[status]} data-live={status !== 'ready' && status !== 'error' ? 'true' : undefined}>
          <span data-testid="status">{cap(status)}</span>
        </span>
        {error ? <span className="err small">{error}</span> : null}
        <span className="spacer" />
        <button className="btn-sm btn-ghost" onClick={togglePause} disabled={status !== 'ready'} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn-sm btn-ghost" onClick={toggleMute} disabled={status !== 'ready'} aria-pressed={muted}>
          {muted ? 'Sound off' : 'Sound on'}
        </button>
        <button className="btn-sm btn-ghost" onClick={fullscreen}>
          Full screen
        </button>
        {dev ? (
          <>
            <button className="btn-sm" onClick={() => send({ type: 'request_state' })} data-testid="request-state">
              State
            </button>
            <button className="btn-sm" onClick={() => send({ type: 'request_screenshot' })}>
              Screenshot
            </button>
          </>
        ) : null}
      </div>
      {dev && (state || metrics || events.length || shot) ? (
        <div className="devtools">
          {state ? (
            <div className="state" data-testid="state">
              tick {state.tick} · scene {state.scene} · hash {state.hash}
            </div>
          ) : null}
          {metrics ? (
            <div>
              {metrics.fps} fps · p95 frame {metrics.frameMsP95} ms
            </div>
          ) : null}
          {events.length ? (
            <ul className="events">
              {events.map((e, i) => (
                <li key={`${e}-${i}`}>{e}</li>
              ))}
            </ul>
          ) : null}
          {shot ? <img src={shot} alt="screenshot" className="shot" /> : null}
        </div>
      ) : null}
    </div>
  );
}
