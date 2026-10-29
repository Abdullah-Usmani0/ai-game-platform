'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameToHost } from '@gg/schemas';
import { BridgeHost } from '@/lib/bridge-host';

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

export function PlayFrame({ bundleUrl, mode, seed, onMessage, sampleStateMs }: PlayFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hostRef = useRef<BridgeHost | null>(null);
  const [status, setStatus] = useState<Status>('loading');
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
      prefs: { reduceShake: false, colorblind: false, mute: false },
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

  return (
    <div className="play">
      <div className="frame-wrap">
        <iframe
          ref={iframeRef}
          title="game"
          src={bundleUrl}
          sandbox="allow-scripts"
          allow="autoplay"
          referrerPolicy="no-referrer"
        />
      </div>
      <aside className="panel" data-status={status}>
        <h2>Bridge</h2>
        <p>
          status: <strong data-testid="status">{status}</strong>
          {error ? <span className="err"> error: {error}</span> : null}
        </p>
        <div className="row">
          <button onClick={() => send({ type: 'pause' })}>pause</button>
          <button onClick={() => send({ type: 'resume' })}>resume</button>
          <button onClick={() => send({ type: 'request_state' })} data-testid="request-state">
            state
          </button>
          <button onClick={() => send({ type: 'request_screenshot' })}>screenshot</button>
        </div>
        {state ? (
          <p data-testid="state">
            tick {state.tick} · scene {state.scene} · hash {state.hash}
          </p>
        ) : null}
        {metrics ? (
          <p>
            {metrics.fps} fps · p95 {metrics.frameMsP95} ms
          </p>
        ) : null}
        <ul className="events">
          {events.map((e, i) => (
            <li key={`${e}-${i}`}>{e}</li>
          ))}
        </ul>
        {shot ? <img src={shot} alt="screenshot" className="shot" /> : null}
      </aside>
    </div>
  );
}
