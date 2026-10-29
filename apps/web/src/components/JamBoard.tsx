'use client';

import Link from 'next/link';
import { useState } from 'react';
import { utc } from '@/lib/jam-format';
import type { JamEntryView, JamView } from '@/lib/jams';

const PHASE: Record<JamView['phase'], string> = {
  upcoming: 'Coming up',
  open: 'Entries open',
  voting: 'Voting',
  closed: 'Finished',
};
const PHASE_TONE: Record<JamView['phase'], string> = { upcoming: 'info', open: 'ok', voting: 'brand', closed: 'neutral' };
const CRITERIA = [
  ['fun', 'Fun'],
  ['theme', 'Theme'],
  ['look', 'Look & sound'],
] as const;
type Scores = { fun: number; theme: number; look: number };

function VoteForm({ entry, onVote }: { entry: JamEntryView; onVote: (gameId: string, scores: Scores) => Promise<boolean> }) {
  const [scores, setScores] = useState<Partial<Scores>>(entry.myVote ?? {});
  const [busy, setBusy] = useState(false);
  const complete = CRITERIA.every(([k]) => scores[k] !== undefined);
  return (
    <div className="jam-vote" data-testid="jam-vote" data-game={entry.gameId} data-voted={entry.myVote ? 'yes' : 'no'}>
      {CRITERIA.map(([k, label]) => (
        <label key={k}>
          {label}{' '}
          <select value={scores[k] ?? ''} onChange={(e) => setScores({ ...scores, [k]: Number(e.target.value) })} data-testid={`jam-vote-${k}`}>
            <option value="" disabled>
              –
            </option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        disabled={!complete || busy}
        onClick={async () => {
          setBusy(true);
          await onVote(entry.gameId, scores as Scores);
          setBusy(false);
        }}
        data-testid="jam-vote-save"
      >
        {entry.myVote ? 'Update vote' : 'Vote'}
      </button>
    </div>
  );
}

/** A jam's page: theme and moments, entering and withdrawing a game, voting on entries, results; moderators move the moments. */
export function JamBoard({ initial }: { initial: JamView }) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState('');
  const [pick, setPick] = useState(initial.viewer.eligible[0]?.id ?? '');
  const { jam, phase, viewer } = view;

  async function refresh() {
    const r = await fetch(`/api/jams/${jam.id}`, { cache: 'no-store' });
    if (r.ok) setView((await r.json()) as JamView);
  }
  async function post(path: string, body: unknown): Promise<boolean> {
    setError('');
    const r = await fetch(`/api/jams/${jam.id}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `that did not work (${r.status})`);
    await refresh();
    return r.ok;
  }
  const mine = view.entries.find((e) => e.mine);

  return (
    <div className="jam" data-testid="jam" data-phase={phase} data-jam={jam.id}>
      <div className="page-head">
        <div>
          <div className="cluster" style={{ marginBottom: 10 }}>
            <span className="pill dot" data-tone={PHASE_TONE[phase]}>
              {PHASE[phase]}
            </span>
            {jam.genres.length ? <span className="pill">{jam.genres.join(', ')} only</span> : null}
          </div>
          <h1>{jam.title}</h1>
          <p className="jam-theme">
            Theme: <span className="gradient-text">{jam.theme}</span>
          </p>
          {jam.description ? <p className="lead">{jam.description}</p> : null}
        </div>
      </div>
      <div className="timeline" data-testid="jam-phase">
        <div data-current={phase === 'open' ? 'true' : undefined}>
          <strong>Entries open</strong>
          {utc(jam.startsAt)}
        </div>
        <div data-current={phase === 'voting' ? 'true' : undefined}>
          <strong>Voting</strong>
          from {utc(jam.submissionsClose)}
        </div>
        <div data-current={phase === 'closed' ? 'true' : undefined}>
          <strong>Results</strong>
          {utc(jam.votingClose)}
        </div>
      </div>
      {error ? (
        <p className="err" data-testid="jam-error">
          {error}
        </p>
      ) : null}
      {viewer.moderator && phase !== 'closed' ? (
        <div className="row">
          {phase === 'upcoming' ? <button onClick={() => void post('schedule', { startsAt: new Date().toISOString() })}>Open entries now</button> : null}
          {phase === 'open' ? (
            <button onClick={() => void post('schedule', { submissionsClose: new Date().toISOString() })} data-testid="jam-open-voting">
              Close submissions, open voting
            </button>
          ) : null}
          {phase === 'voting' ? (
            <button onClick={() => void post('schedule', { votingClose: new Date().toISOString() })} data-testid="jam-publish-results">
              Close voting, publish results
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === 'open' ? (
        <div className="panel" data-testid="jam-enter">
          <h2>Your entry</h2>
          {mine ? (
            <p>
              <Link href={mine.playUrl}>{mine.title}</Link> is entered as it is now; entering it again freezes its latest version.{' '}
              <button onClick={() => void post('entries', { gameId: mine.gameId })}>Enter latest version</button>{' '}
              <button onClick={() => void post('entries', { gameId: mine.gameId, withdraw: true })} data-testid="jam-withdraw">
                Withdraw
              </button>
            </p>
          ) : viewer.eligible.length ? (
            <div className="row">
              <select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="jam-pick">
                {viewer.eligible.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <button disabled={!pick} onClick={() => void post('entries', { gameId: pick })} data-testid="jam-submit">
                Enter this game
              </button>
            </div>
          ) : (
            <p className="muted">Make a game after {utc(jam.startsAt)}, publish it to the feed, and it can be entered here. One game per player; its version is frozen when it is entered.</p>
          )}
        </div>
      ) : null}

      {phase === 'open' || phase === 'voting' ? (
        <div className="panel">
          <h2>Entries ({view.entries.length})</h2>
          {phase === 'voting' ? <p className="muted">Play an entry for 30 seconds, then score it 1 to 5. You can change your vote until voting closes; you cannot vote on your own entry.</p> : null}
          <ul className="jam-entries">
            {view.entries.map((e) => (
              <li key={e.gameId} data-testid="jam-entry" data-game={e.gameId}>
                <Link href={e.playUrl}>{e.title}</Link> <span className="muted">{e.genre}</span> {e.mine ? <span className="badge added">yours</span> : null}
                {phase === 'voting' && !e.mine ? <VoteForm entry={e} onVote={(gameId, scores) => post('votes', { gameId, ...scores })} /> : null}
              </li>
            ))}
          </ul>
          {view.entries.length === 0 ? <p className="muted">No entries yet.</p> : null}
        </div>
      ) : null}

      {view.results ? (
        <div className="panel" data-testid="jam-results">
          <h2>Results</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Game</th>
                <th>Votes</th>
                <th>Fun</th>
                <th>Theme</th>
                <th>Look &amp; sound</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {view.results.map((r) => (
                <tr key={r.gameId} data-testid="jam-result" data-game={r.gameId} data-rank={r.rank ?? ''}>
                  <td>{r.rank ?? '–'}</td>
                  <td>
                    <Link href={r.playUrl}>{r.title}</Link>
                  </td>
                  <td>{r.votes}</td>
                  <td>{r.fun?.toFixed(2) ?? '–'}</td>
                  <td>{r.theme?.toFixed(2) ?? '–'}</td>
                  <td>{r.look?.toFixed(2) ?? '–'}</td>
                  <td>{r.score.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Entries rank by score once they have 3 votes: each criterion counts as if every entry also had three votes of 3, so a handful of fives cannot top the jam.</p>
        </div>
      ) : null}
      <p style={{ marginTop: 24 }}>
        <Link href="/jams">← All jams</Link>
      </p>
    </div>
  );
}
