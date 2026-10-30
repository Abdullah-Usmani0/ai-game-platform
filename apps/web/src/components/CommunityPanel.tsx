'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppealForm } from '@/components/AppealForm';
import { levelName, listOf } from '@/lib/text';

interface CommunityView {
  isOwner: boolean;
  visibility: string;
  state: string;
  tested: { outcome?: string; versionId?: string } | null;
  stats: { players: number; qualifiedPlayers: number; completionRate: number; avgPlayMin: number; ratings: Record<string, number>; ratingCount: number; remixes: number; rankScore: number; broken: boolean };
  tests: Array<{ id: string; status: string; outcome: string | null; needed: number; submitted: number; rewardCredits: number; verdicts: Array<{ verdict: string; tag: string; note: string }> }>;
  moderation: { ownerStrikes: number | null; openReports: number | null; removedFor: string | null; unlistedFor: string | null; removedKind: string | null; appeal: { status: string; reinstateAfter: string; decisionNote: string } | null };
  proofs: { waiting: string[]; runs: Array<{ level: string; status: string; reason: string | null; createdAt: string }> };
}


/** Listing, community stats and test rounds of a game, in the creator's workspace. */
export function CommunityPanel({ gameId, hasHead }: { gameId: string; hasHead: boolean }) {
  const [view, setView] = useState<CommunityView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}/community`, { cache: 'no-store' });
    if (res.ok) setView((await res.json()) as CommunityView);
  }, [gameId]);
  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/${gameId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${path} failed`);
    setBusy(false);
    await refresh();
  }

  if (!view) return null;
  const s = view.stats;
  const listed = view.visibility === 'listed';
  const open = view.tests.find((t) => t.status === 'open');
  const last = [...view.tests].reverse().find((t) => t.status === 'closed');
  const waiting = view.proofs.waiting;
  // The latest run players sent for each waiting level: being replayed, or why it did not count.
  const lastRun = new Map(view.proofs.runs.filter((r) => waiting.includes(r.level)).map((r) => [r.level, r]));
  return (
    <div className="panel" data-testid="community" data-listed={listed ? 'yes' : 'no'}>
      <h2>
        Community
        <span className="pill dot" data-tone={listed ? (waiting.length ? 'warn' : 'ok') : 'neutral'}>
          {listed ? (waiting.length ? 'Out of the feed until proven' : 'In the feed') : 'Not listed'}
        </span>
        {s.broken ? (
          <span className="pill" data-tone="err">
            Marked broken
          </span>
        ) : null}
      </h2>
      <div className="community-stats">
        <div className="stat">
          <span className="value">{s.players}</span>
          <span className="label">players</span>
        </div>
        <div className="stat">
          <span className="value">{s.qualifiedPlayers}</span>
          <span className="label">played 30 s+</span>
        </div>
        <div className="stat">
          <span className="value">{Math.round(s.completionRate * 100)}%</span>
          <span className="label">finish</span>
        </div>
        <div className="stat">
          <span className="value">{s.avgPlayMin.toFixed(1)}</span>
          <span className="label">min avg</span>
        </div>
      </div>
      <div className="ratings">
        <span className="pill">Fun {s.ratings['fun'] ?? 0}</span>
        <span className="pill">Confusing {s.ratings['confusing'] ?? 0}</span>
        <span className="pill">Broken {s.ratings['broken'] ?? 0}</span>
        <span className="pill">Ugly {s.ratings['ugly'] ?? 0}</span>
        <span className="pill">Remixes {s.remixes}</span>
        <span className="pill" title="feed rank score">Rank {s.rankScore.toFixed(3)}</span>
      </div>
      {view.state === 'removed' ? (
        <>
          <div className="callout" data-tone="err" data-testid="moderation-state" data-state="removed">
            Removed by moderation{view.moderation.removedFor ? `: ${view.moderation.removedFor}` : ''}. It cannot be played, edited, listed or remixed.
          </div>
          {view.isOwner && !view.moderation.appeal ? <AppealForm gameId={gameId} counterNotice={view.moderation.removedKind === 'ip'} onSent={() => void refresh()} /> : null}
          {view.moderation.appeal?.status === 'open' ? (
            <p className="muted small" data-testid="appeal-status" data-status="open">
              Appeal filed; moderators can restore the game from {new Date(view.moderation.appeal.reinstateAfter).toLocaleDateString()}.
            </p>
          ) : view.moderation.appeal?.status === 'upheld' ? (
            <p className="err small" data-testid="appeal-status" data-status="upheld">
              Appeal upheld: the removal stands{view.moderation.appeal.decisionNote ? ` (${view.moderation.appeal.decisionNote})` : ''}.
            </p>
          ) : null}
        </>
      ) : view.state === 'suspended' ? (
        <div className="callout" data-tone="warn" data-testid="moderation-state" data-state="suspended">
          Suspended: hidden from other players until moderators review the reports about it{view.moderation.openReports ? ` (${view.moderation.openReports} open)` : ''}.
        </div>
      ) : view.moderation.unlistedFor !== null ? (
        <div className="callout" data-tone="warn" data-testid="moderation-state" data-state="unlisted">
          A moderator unlisted this version{view.moderation.unlistedFor ? `: ${view.moderation.unlistedFor}` : ''}. Publish a fixed version to list it again.
        </div>
      ) : view.moderation.openReports ? (
        <p className="muted small">{view.moderation.openReports} open report(s) await review.</p>
      ) : null}
      {view.isOwner && view.moderation.ownerStrikes ? <p className="err small">Your account has {view.moderation.ownerStrikes} active strike(s); three block listing.</p> : null}
      {view.isOwner && waiting.length ? (
        <div className="callout" data-tone="warn" data-testid="proofs-waiting" data-levels={waiting.join(',')}>
          <strong>{listOf(waiting.map(levelName))}</strong> {waiting.length === 1 ? 'waits' : 'wait'} for a winning run: no bot could finish {waiting.length === 1 ? 'it' : 'them'}, so the game can be listed once a player does. Finish {waiting.length === 1 ? 'it' : 'them'} yourself on the play page or ask testers; every win on {waiting.length === 1 ? 'it' : 'them'} is replayed to check it.
          {[...lastRun.values()].map((r) => (
            <span key={r.level} className="small" style={{ display: 'block', marginTop: 6 }} data-testid="proof-run" data-level={r.level} data-status={r.status}>
              {r.status === 'pending' ? `${levelName(r.level)}: a player's run is being replayed` : `${levelName(r.level)}: the last run did not count${r.reason ? ` (${r.reason})` : ''}`}
            </span>
          ))}
        </div>
      ) : null}
      {open ? (
        <p className="small" data-testid="test-status">
          Testers: {open.submitted}/{open.needed} reports in (reward {open.rewardCredits} credits each)
        </p>
      ) : last ? (
        <p className="small" data-testid="test-status">
          Last test round: <strong className={last.outcome === 'works' ? 'ok' : 'err'}>{last.outcome}</strong> <span className="muted">({last.verdicts.map((v) => `${v.verdict}/${v.tag}`).join(', ')})</span>
        </p>
      ) : null}
      {view.isOwner ? (
        <div className="row">
          <button className={listed ? undefined : 'btn-primary'} disabled={busy || !hasHead || view.state === 'removed' || view.state === 'suspended' || (!listed && waiting.length > 0)} title={!listed && waiting.length ? `${listOf(waiting.map(levelName))} ${waiting.length === 1 ? 'has' : 'have'} no recorded winning run yet` : undefined} onClick={() => void post('publish', { listed: !listed })} data-testid="publish">
            {listed ? 'Unlist' : 'Publish to the feed'}
          </button>
          <button disabled={busy || !hasHead || Boolean(open) || view.state === 'removed' || view.state === 'suspended'} onClick={() => void post('tests', { needed: 3, rewardCredits: 5 })} data-testid="ask-testers">
            Ask 3 testers <span className="muted">· 5 credits each</span>
          </button>
        </div>
      ) : null}
      {error ? <p className="err small">{error}</p> : null}
    </div>
  );
}
