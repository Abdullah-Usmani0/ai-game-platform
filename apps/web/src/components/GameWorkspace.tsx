'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LevelJson } from '@gg/schemas';
import { CodeView } from '@/components/CodeView';
import { CommunityPanel } from '@/components/CommunityPanel';
import { Icon } from '@/components/Icon';
import { LevelEditor, type EditorLook } from '@/components/LevelEditor';
import { ParamPanel, type PanelItem } from '@/components/ParamPanel';
import { PlayFrame } from '@/components/PlayFrame';
import { RemixButton } from '@/components/RemixButton';
import { StyleEditor, type StyleLike } from '@/components/StyleEditor';
import { gameGenreLabel } from '@/lib/genres';
import { cap } from '@/lib/text';

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
  panels?: PanelItem[] | null;
  style?: StyleLike | null;
}
interface JobView {
  job: { id: string; kind: string; status: string; stage: string | null; costUsd: number; turns: number; resultVersionId: string | null; error: { stage?: string; reason?: string } | null };
  events: Array<{ seq: number; stage: string | null; type: string; payload: Record<string, unknown> }>;
  trajectories: Array<{ stage: string; attempt: number; passed: boolean; model: string; costUsd: number; durationMs: number; failureMode: string | null }>;
}
interface GameView {
  head: (HeadInfo & { bundlePath: string | null; design?: { evidence?: Record<string, unknown>; panels?: PanelItem[]; style?: StyleLike } }) | null;
  versions: Array<{ id: string; number: number; kind: string; stage: string | null; isHead: boolean; bundleBase: string | null; summary: string; createdAt: string }>;
  jobs: Array<{ id: string; kind: string; status: string; stage: string | null; costUsd: number; createdAt: string; error: { reason?: string } | null }>;
}

const CREATE_STAGES = ['gdd', 'systems', 'sprites', 'scaffold', 'behaviour', 'implement', 'levels', 'integrate', 'playtest', 'juice', 'review', 'budget', 'publish'];
/** A freeform game names its cast after its systems and records its winning runs again after its code changes. */
const FREEFORM_STAGES = CREATE_STAGES.flatMap((s) => (s === 'systems' ? [s, 'composition'] : s === 'implement' ? [s, 'prove'] : [s]));
const STAGE_LABELS: Record<string, string> = { gdd: 'Design', systems: 'Systems', composition: 'Cast', prove: 'Proofs', sprites: 'Sprites', scaffold: 'Scaffold', behaviour: 'Behaviour', implement: 'Code', levels: 'Levels', integrate: 'Integrate', playtest: 'Playtest', juice: 'Juice', review: 'Review', budget: 'Budget', publish: 'Publish' };
const JOB_TONE: Record<string, string> = { queued: 'info', running: 'brand', succeeded: 'ok', failed: 'err', needs_human: 'warn', cancelled: 'neutral' };
const JOB_TITLE: Record<string, string> = { create: 'Building the game', edit: 'Applying an edit', edit_content: 'Applying a level edit' };
const EDIT_EXAMPLES = ['make the walker chase more aggressively', 'make jumps a little floatier', 'a warmer, sunset palette', 'add a third level that is harder'];

type StageState = 'pending' | 'running' | 'passed' | 'failed' | 'retry';
type Tab = 'overview' | 'tune' | 'style' | 'levels' | 'code' | 'history';

function stageStates(view: JobView | null, genre: string): Array<{ stage: string; state: StageState; attempts: number; detail: string }> {
  const plan = genre === 'freeform' ? FREEFORM_STAGES : CREATE_STAGES;
  if (!view) return plan.map((stage) => ({ stage, state: 'pending', attempts: 0, detail: '' }));
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
  const stages = view.job.kind === 'create' ? [...plan] : order;
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
  const [tab, setTab] = useState<Tab>('overview');
  const editBox = useRef<HTMLTextAreaElement>(null);
  const lastStatus = useRef<string | null>(null);

  const refreshGame = useCallback(async () => {
    const res = await fetch(`/api/games/${game.id}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as GameView;
    setGameView(data);
    if (data.head && data.head.id !== head?.id) {
      setHead({ id: data.head.id, number: data.head.number, bundleBase: data.head.bundleBase, evidence: data.head.design?.evidence ?? null, panels: data.head.design?.panels ?? null, style: data.head.design?.style ?? null });
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

  async function submitEdit(text: string, content?: { levels: LevelJson[] }) {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/games/${game.id}/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, dryRun, content }) });
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
  const sendEdit = () => submitEdit(message);

  const stages = stageStates(jobView, game.genre);
  const status = jobView?.job.status ?? (jobId ? 'loading' : 'idle');
  const active = status === 'queued' || status === 'running';
  const locked = sending || active || !game.headVersionId;
  const passed = stages.filter((s) => s.state === 'passed').length;
  const evidence = head?.evidence as { gates?: Array<{ stage: string; passed: boolean; checks: string[]; durationMs: number }>; playtest?: { passed: boolean; replayHashMatch: boolean | null; readyMs: number | null; metrics: Record<string, number>; seeds: number[] } | null; budget?: { gameJsBytes: number }; thumbnail?: string | null } | null;
  const route = jobView?.events.find((e) => e.stage === 'route')?.payload as { route?: string; confidence?: number; designNotes?: string } | undefined;
  const tabs: Array<{ id: Tab; label: string; count?: number; show: boolean }> = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'tune', label: 'Tune', count: head?.panels?.length, show: Boolean(head?.panels?.length) },
    { id: 'style', label: 'Style', show: Boolean(head?.style) },
    { id: 'levels', label: 'Levels', show: Boolean(head?.bundleBase) },
    { id: 'code', label: 'Code', show: true },
    { id: 'history', label: 'History', count: gameView?.versions.length, show: true },
  ];
  // The level editor paints with the game's own palette; memoised so polling re-renders do not repaint the level.
  const style = head?.style ?? null;
  const look = useMemo<EditorLook | undefined>(() => (style ? { palette: style.palette as unknown as EditorLook['palette'], outline: style.outline as EditorLook['outline'] } : undefined), [style]);
  const ask = (text: string) => {
    setMessage(text);
    editBox.current?.focus();
  };

  return (
    <div className="workspace">
      <header className="ws-head">
        <div>
          <div className="cluster" style={{ marginBottom: 8 }}>
            <span className="pill" data-testid="genre-pill">{gameGenreLabel(game.genre, gameView?.head?.design)}</span>
            <span className="pill" data-tone={game.state === 'removed' || game.state === 'suspended' ? 'err' : game.headVersionId ? 'ok' : 'neutral'}>
              {game.headVersionId ? cap(game.state) : 'No version yet'}
            </span>
          </div>
          <h1>{game.title}</h1>
          <div className="ws-meta">
            <span>{gameView?.head ? `Version ${gameView.head.number}` : 'No accepted version yet'}</span>·<Link href="/games">All your games</Link>
          </div>
        </div>
        <div className="ws-actions">
          {game.headVersionId ? (
            <Link className="btn" href={`/play/${game.id}`}>
              <Icon name="play" /> Play page
            </Link>
          ) : null}
          <RemixButton gameId={game.id} disabled={!game.headVersionId} />
        </div>
      </header>

      <div className="ws-top">
        <div className="stack">
          {head?.bundleBase ? (
            <PlayFrame key={frameKey} bundleUrl={`${head.bundleBase}/index.html`} mode="preview" seed={1} />
          ) : (
            <div className="frame-wrap placeholder" data-testid="no-preview">
              <div className="stack-sm">
                <strong>{active ? 'Building your game…' : 'No preview yet'}</strong>
                <span className="muted">The game appears here as soon as a version passes every gate.</span>
              </div>
            </div>
          )}
          <div className="panel composer">
            <h2>
              <Icon name="spark" /> Ask for a change
            </h2>
            <textarea ref={editBox} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder='Describe it in plain words, e.g. "make the walker chase more aggressively", or set a value: "set hazards.respawnDelayTicks=20"' disabled={active || !game.headVersionId} data-testid="edit-message" />
            {!message && game.headVersionId && !active ? (
              <div className="suggestions">
                {EDIT_EXAMPLES.map((ex) => (
                  <button type="button" key={ex} className="suggestion" onClick={() => ask(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="composer-foot">
              <span className="muted small">Tuning, style, behaviour and level edits finish in minutes; anything else runs a full code session and every gate.</span>
              <div className="cluster">
                <label className="check small">
                  <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run
                </label>
                <button className="btn-primary" onClick={sendEdit} disabled={locked || !message.trim()} data-testid="edit-send">
                  {sending ? 'Sending…' : 'Apply'}
                </button>
              </div>
            </div>
            {error ? (
              <div className="callout" data-tone="err" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="ws-side">
          <div className="panel" data-testid="progress" data-status={status}>
            <h2>
              {jobView ? (JOB_TITLE[jobView.job.kind] ?? jobView.job.kind) : 'Jobs'}
              <span className="pill dot" data-tone={JOB_TONE[status] ?? 'neutral'} data-live={active ? 'true' : undefined}>
                <span data-testid="job-status">{cap(status)}</span>
              </span>
              {jobView ? <span className="muted small mono">${jobView.job.costUsd.toFixed(3)}</span> : null}
            </h2>
            {jobView ? (
              <div className="progress-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((passed / Math.max(1, stages.length)) * 100)}%` }} />
              </div>
            ) : null}
            {route ? (
              <p className="muted small">
                Routed to <strong>{route.route}</strong> ({Math.round((route.confidence ?? 0) * 100)}%): {route.designNotes}
              </p>
            ) : null}
            {status === 'queued' ? (
              <p className="muted small">
                Waiting for a worker. Locally: <code>pnpm --filter @gg/worker-generator start</code>
              </p>
            ) : null}
            {jobView || jobId ? (
              <ol className="stages">
                {stages.map((s) => (
                  <li key={s.stage} data-state={s.state} data-stage={s.stage}>
                    <span className="dot" />
                    <span className="name">{STAGE_LABELS[s.stage] ?? s.stage}</span>
                    {s.attempts > 1 ? <span className="attempts">attempt {s.attempts}</span> : <span />}
                    {s.detail ? <span className="detail">{s.detail}</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">Edits you ask for show their progress here.</p>
            )}
            {jobView?.job.error ? (
              <div className="callout" data-tone="err" style={{ marginTop: 10 }}>
                {jobView.job.error.stage}: {jobView.job.error.reason}
              </div>
            ) : null}
          </div>
          <CommunityPanel gameId={game.id} hasHead={Boolean(game.headVersionId)} />
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Workspace">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button key={t.id} role="tab" type="button" className="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
              {t.label}
              {t.count ? <span className="count">{t.count}</span> : null}
            </button>
          ))}
      </div>

      <section className="tab-panel" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden={tab !== 'overview'}>
        {evidence ? (
          <div className="panel" data-testid="evidence">
            <h2>
              Evidence <span className="muted">· version {head?.number}</span>
            </h2>
            <div className="evidence">
              {evidence.thumbnail && head?.bundleBase ? <img src={`${head.bundleBase}/thumbnail.png`} alt="mid-play screenshot" className="shot" /> : null}
              <div className="stack">
                {evidence.playtest ? (
                  <div className="stats">
                    <div className="stat">
                      <span className="value">{evidence.playtest.passed ? 'Passed' : 'Failed'}</span>
                      <span className="label">bot playtest</span>
                    </div>
                    <div className="stat">
                      <span className="value">{evidence.playtest.replayHashMatch ? 'Match' : 'Differs'}</span>
                      <span className="label">replay hash</span>
                    </div>
                    <div className="stat">
                      <span className="value">{evidence.playtest.readyMs ?? '–'} ms</span>
                      <span className="label">time to ready</span>
                    </div>
                    <div className="stat">
                      <span className="value">{Math.round((evidence.playtest.metrics['frameMsP95'] ?? 0) * 10) / 10} ms</span>
                      <span className="label">p95 frame</span>
                    </div>
                    {evidence.budget ? (
                      <div className="stat">
                        <span className="value">{Math.round(evidence.budget.gameJsBytes / 1024)} KB</span>
                        <span className="label">game code</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <table>
                  <thead>
                    <tr>
                      <th>Gate</th>
                      <th>Result</th>
                      <th>Checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(evidence.gates ?? []).map((g) => (
                      <tr key={g.stage}>
                        <td>{STAGE_LABELS[g.stage] ?? g.stage}</td>
                        <td>
                          <span className="pill" data-tone={g.passed ? 'ok' : 'err'}>
                            {g.passed ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                        <td className="muted">{g.checks.map((c) => c.split(':')[0]).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">
            <strong>No evidence yet</strong>
            <span>Every accepted version comes with its gate results, a bot playtest and a mid-play screenshot.</span>
          </div>
        )}
      </section>
      <section className="tab-panel" role="tabpanel" id="panel-tune" aria-labelledby="tab-tune" hidden={tab !== 'tune'}>
        {head?.panels?.length ? <ParamPanel panels={head.panels} disabled={locked} onApply={(m) => void submitEdit(m)} /> : null}
      </section>
      <section className="tab-panel" role="tabpanel" id="panel-style" aria-labelledby="tab-style" hidden={tab !== 'style'}>
        {head?.style ? <StyleEditor style={head.style} disabled={locked} onApply={(m) => void submitEdit(m)} /> : null}
      </section>
      <section className="tab-panel" role="tabpanel" id="panel-levels" aria-labelledby="tab-levels" hidden={tab !== 'levels'}>
        {head?.bundleBase ? <LevelEditor key={head.id} genre={game.genre} bundleBase={head.bundleBase} disabled={locked} onApply={(content, m) => void submitEdit(m, content)} heatSrc={`/api/games/${game.id}/heatmap?version=${head.id}`} look={look} /> : null}
      </section>
      <section className="tab-panel" role="tabpanel" id="panel-code" aria-labelledby="tab-code" hidden={tab !== 'code'}>
        <CodeView gameId={game.id} headId={head?.id ?? null} versions={gameView?.versions ?? []} onAsk={(path) => ask(`In ${path}: `)} />
      </section>
      <section className="tab-panel" role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden={tab !== 'history'}>
        <div className="panel">
          <h2>Versions</h2>
          {gameView?.versions.length ? (
            <ul className="versions">
              {gameView.versions.slice(0, 20).map((v) => (
                <li key={v.id}>
                  <span className="num">#{v.number}</span>
                  <span>
                    <span className="cluster">
                      <strong>{v.kind === 'accepted' ? 'Accepted' : v.kind}</strong>
                      {v.stage ? <span className="muted">{STAGE_LABELS[v.stage] ?? v.stage}</span> : null}
                      {v.isHead ? (
                        <span className="pill" data-tone="ok">
                          Head
                        </span>
                      ) : null}
                    </span>
                    {v.summary ? <span className="detail">{v.summary.slice(0, 160)}</span> : null}
                  </span>
                  <span className="muted small nowrap">{new Date(v.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No versions yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
