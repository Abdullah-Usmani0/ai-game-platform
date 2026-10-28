'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayFrame } from '@/components/PlayFrame';

interface GameInfo {
  id: string;
  title: string;
  genre: string;
  state: string;
  conceptMd: string;
  headVersionId: string | null;
}
interface HeadInfo {
  id: string;
  number: number;
  bundleBase: string | null;
  evidence: Record<string, unknown> | null;
}
interface JobView {
  job: { id: string; kind: string; status: string; stage: string | null; costUsd: number; turns: number; resultVersionId: string | null; error: { stage?: string; reason?: string } | null };
  events: Array<{ seq: number; stage: string | null; type: string; payload: Record<string, unknown> }>;
  trajectories: Array<{ stage: string; attempt: number; passed: boolean; model: string; costUsd: number; durationMs: number; failureMode: string | null }>;
}
interface GameView {
  head: (HeadInfo & { bundlePath: string | null }) | null;
  versions: Array<{ id: string; number: number; kind: string; stage: string | null; isHead: boolean; bundleBase: string | null; summary: string; createdAt: string }>;
  jobs: Array<{ id: string; kind: string; status: string; stage: string | null; costUsd: number; createdAt: string; error: { reason?: string } | null }>;
}

const CREATE_STAGES = ['gdd', 'systems', 'scaffold', 'behaviour', 'implement', 'levels', 'integrate', 'playtest', 'juice', 'review', 'budget', 'publish'];

type StageState = 'pending' | 'running' | 'passed' | 'failed' | 'retry';

function stageStates(view: JobView | null): Array<{ stage: string; state: StageState; attempts: number; detail: string }> {
  if (!view) return CREATE_STAGES.map((stage) => ({ stage, state: 'pending', attempts: 0, detail: '' }));
  const order: string[] = [];
  const info = new Map<string, { state: StageState; attempts: number; detail: string }>();
  for (const e of view.events) {
    if (!e.stage || e.stage === 'route') continue;
    if (!info.has(e.stage)) {
      order.push(e.stage);
      info.set(e.stage, { state: 'pending', attempts: 0, detail: '' });
    }
    const s = info.get(e.stage)!;
    if (e.type === 'stage_started') {
      s.state = 'running';
      s.attempts = Number(e.payload['attempt'] ?? s.attempts + 1);
    } else if (e.type === 'gate_passed') s.state = 'passed';
    else if (e.type === 'gate_failed') {
      s.state = 'failed';
      s.detail = ((e.payload['failing'] as string[]) ?? []).join(', ');
    } else if (e.type === 'retry') s.state = 'retry';
    else if (e.type === 'assistant_summary' && typeof e.payload['summary'] === 'string' && s.state !== 'failed') s.detail = e.payload['summary'] as string;
  }
  const stages = view.job.kind === 'create' ? CREATE_STAGES : order;
  for (const st of order) if (!stages.includes(st)) stages.push(st);
  return stages.map((stage) => ({ stage, ...(info.get(stage) ?? { state: 'pending' as StageState, attempts: 0, detail: '' }) }));
}

export function GameWorkspace({ game, initialJobId, initialHead }: { game: GameInfo; initialJobId: string | null; initialHead: HeadInfo | null }) {
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [jobView, setJobView] = useState<JobView | null>(null);
  const [gameView, setGameView] = useState<GameView | null>(null);
  const [head, setHead] = useState<HeadInfo | null>(initialHead);
  const [message, setMessage] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const lastStatus = useRef<string | null>(null);

  const refreshGame = useCallback(async () => {
    const res = await fetch(`/api/games/${game.id}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as GameView;
    setGameView(data);
    if (data.head && data.head.id !== head?.id) {
      setHead({ id: data.head.id, number: data.head.number, bundleBase: data.head.bundleBase, evidence: (data.head as unknown as { design?: { evidence?: Record<string, unknown> } }).design?.evidence ?? null });
      setFrameKey((k) => k + 1);
    }
  }, [game.id, head?.id]);

  useEffect(() => {
    void refreshGame();
  }, [refreshGame]);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
      if (!res.ok || stop) return;
      const data = (await res.json()) as JobView;
      setJobView(data);
      const finished = ['succeeded', 'failed', 'needs_human', 'cancelled'].includes(data.job.status);
      if (finished && lastStatus.current !== data.job.status) await refreshGame();
      lastStatus.current = data.job.status;
      if (!finished && !stop) setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [jobId, refreshGame]);

  async function sendEdit() {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/games/${game.id}/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, dryRun }) });
    const data = (await res.json()) as { jobId?: string; error?: string | string[] };
    setSending(false);
    if (!res.ok || !data.jobId) {
      setError(Array.isArray(data.error) ? data.error.join('; ') : (data.error ?? 'request failed'));
      return;
    }
    setMessage('');
    lastStatus.current = null;
    setJobId(data.jobId);
  }

  const stages = stageStates(jobView);
  const status = jobView?.job.status ?? (jobId ? 'loading' : 'idle');
  const active = status === 'queued' || status === 'running';
  const evidence = head?.evidence as { gates?: Array<{ stage: string; passed: boolean; checks: string[]; durationMs: number }>; playtest?: { passed: boolean; replayHashMatch: boolean | null; readyMs: number | null; metrics: Record<string, number>; seeds: number[] } | null; budget?: { gameJsBytes: number }; thumbnail?: string | null } | null;
  const route = jobView?.events.find((e) => e.stage === 'route')?.payload as { route?: string; confidence?: number; designNotes?: string } | undefined;

  return (
    <div className="workspace">
      <section className="col">
        <h1>{game.title}</h1>
        <p className="muted">
          {game.genre} · {gameView?.head ? `version ${gameView.head.number}` : 'no accepted version yet'} · <Link href="/games">all games</Link>
        </p>
        {head?.bundleBase ? (
          <PlayFrame key={frameKey} bundleUrl={`${head.bundleBase}/index.html`} mode="preview" seed={1} />
        ) : (
          <div className="frame-wrap placeholder" data-testid="no-preview">
            <p className="muted">The preview appears here after the first accepted version.</p>
          </div>
        )}
        {evidence ? (
          <div className="panel" data-testid="evidence">
            <h2>Evidence (version {head?.number})</h2>
            <div className="evidence">
              {evidence.thumbnail && head?.bundleBase ? <img src={`${head.bundleBase}/thumbnail.png`} alt="mid-play screenshot" className="shot" /> : null}
              <div>
                <table>
                  <tbody>
                    {(evidence.gates ?? []).map((g) => (
                      <tr key={g.stage}>
                        <td>{g.stage}</td>
                        <td className={g.passed ? 'ok' : 'err'}>{g.passed ? 'pass' : 'fail'}</td>
                        <td className="muted">{g.checks.map((c) => c.split(':')[0]).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {evidence.playtest ? (
                  <p className="muted">
                    playtest {evidence.playtest.passed ? 'passed' : 'failed'} · replay hash {evidence.playtest.replayHashMatch ? 'matches' : 'differs'} · ready {evidence.playtest.readyMs} ms · p95 frame {Math.round((evidence.playtest.metrics['frameMsP95'] ?? 0) * 10) / 10} ms · heap {evidence.playtest.metrics['heapMB']} MB
                  </p>
                ) : null}
                {evidence.budget ? <p className="muted">game.js {Math.round(evidence.budget.gameJsBytes / 1024)} KB</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>
      <section className="col">
        <div className="panel" data-testid="progress" data-status={status}>
          <h2>
            {jobView?.job.kind ?? 'job'} · <span data-testid="job-status">{status}</span>
            {jobView ? <span className="muted"> · ${jobView.job.costUsd.toFixed(3)}</span> : null}
          </h2>
          {route ? (
            <p className="muted">
              routed to <strong>{route.route}</strong> ({Math.round((route.confidence ?? 0) * 100)}%): {route.designNotes}
            </p>
          ) : null}
          {status === 'queued' ? <p className="muted">Waiting for a worker. Run `pnpm --filter @gg/worker-generator start` locally.</p> : null}
          <ol className="stages">
            {stages.map((s) => (
              <li key={s.stage} data-state={s.state}>
                <span className="dot" /> <strong>{s.stage}</strong>
                {s.attempts > 1 ? <span className="muted"> · attempt {s.attempts}</span> : null}
                {s.detail ? <div className="muted detail">{s.detail}</div> : null}
              </li>
            ))}
          </ol>
          {jobView?.job.error ? (
            <p className="err">
              {jobView.job.error.stage}: {jobView.job.error.reason}
            </p>
          ) : null}
        </div>
        <div className="panel">
          <h2>Edit</h2>
          <p className="muted">Describe a change. Parameter, style, behaviour and level edits run in minutes without regenerating the game; anything else goes through a full code session and the whole gate.</p>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder='e.g. "make the walker chase more aggressively" or "set hazards.respawnDelayTicks=20"' disabled={active || !game.headVersionId} data-testid="edit-message" />
          <label className="check">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> dry run
          </label>
          <div className="row">
            <button onClick={sendEdit} disabled={sending || active || !game.headVersionId || !message.trim()} data-testid="edit-send">
              {sending ? 'Sending…' : 'Apply edit'}
            </button>
          </div>
          {error ? <p className="err">{error}</p> : null}
        </div>
        {gameView ? (
          <div className="panel">
            <h2>Versions</h2>
            <ul className="versions">
              {gameView.versions.slice(0, 12).map((v) => (
                <li key={v.id}>
                  <strong>#{v.number}</strong> {v.kind} {v.stage ?? ''} {v.isHead ? <span className="ok">head</span> : null} <span className="muted">{new Date(v.createdAt).toLocaleTimeString()}</span>
                  {v.summary ? <div className="muted detail">{v.summary.slice(0, 140)}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
