'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TrainingConsent } from '@/components/TrainingConsent';
import { GENRES, GENRE_BY_ID } from '@/lib/genres';

const TIERS = [
  { id: 'small', label: 'Small', detail: '3 levels' },
  { id: 'medium', label: 'Medium', detail: '6 levels' },
  { id: 'large', label: 'Large', detail: '10 levels' },
];

const PIPELINE = [
  ['Design', 'A game design document: three pillars, verbs, the feedback every action gets, numeric targets.'],
  ['Build', 'Systems picked from the genre catalog, behaviour and levels written as data, bespoke code only where the design needs it.'],
  ['Prove', 'Bots play every level, the replay must match, the juice and budget checks must pass.'],
  ['Publish', 'Only a version that passed every gate goes live; then you tune it, restyle it or ask for changes.'],
] as const;

/** New game: genre, a description, scope and style references; creates the game and its job, then opens its workspace. */
export default function CreatePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState('platformer');
  const [tier, setTier] = useState('small');
  const [title, setTitle] = useState('');
  const [refs, setRefs] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { prompt, genre, scopeTier: tier, title: title || undefined, referenceTitles: refs.split(',').map((s) => s.trim()).filter(Boolean), dryRun };
    const res = await fetch('/api/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json()) as { gameId?: string; jobId?: string; error?: string[] };
    if (!res.ok || !data.gameId) {
      setError((data.error ?? ['request failed']).join('; '));
      setBusy(false);
      return;
    }
    router.push(`/games/${data.gameId}?job=${data.jobId}`);
  }

  const examples = GENRE_BY_ID[genre]?.examples ?? [];
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Create a game</h1>
          <p className="lead">Pick a genre, describe what you want, and the harness builds it. You can tune, restyle and change it afterwards.</p>
        </div>
      </div>
      <div className="create-layout">
        <form className="create" onSubmit={submit}>
          <section className="step">
            <div className="step-head">
              <span className="step-num">1</span>
              <h2>Pick a genre</h2>
            </div>
            <div className="genres" role="radiogroup" aria-label="Genre">
              {GENRES.map((g) => (
                <label key={g.id} className={genre === g.id ? 'genre selected' : 'genre'} data-genre={g.id}>
                  <input type="radio" name="genre" value={g.id} checked={genre === g.id} onChange={() => setGenre(g.id)} />
                  <span className="genre-cover">
                    <img src={g.image} alt="" loading="lazy" width={320} height={180} />
                  </span>
                  <span className="genre-body">
                    <strong>{g.label}</strong>
                    <span className="muted">{g.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="step">
            <div className="step-head">
              <span className="step-num">2</span>
              <h2>Describe it</h2>
            </div>
            <div className="field prompt-box">
              <label htmlFor="prompt" className="sr-only">
                Describe your game
              </label>
              <textarea id="prompt" required minLength={10} rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Who you play, where it happens, what you do and what makes it hard. One or two sentences is plenty." data-testid="prompt" />
            </div>
            {examples.length ? (
              <div className="suggestions" aria-label="Examples">
                <span className="muted small">Try:</span>
                {examples.map((ex) => (
                  <button type="button" key={ex} className="suggestion" onClick={() => setPrompt(ex)} title={ex}>
                    {ex.length > 64 ? `${ex.slice(0, 62)}…` : ex}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="step">
            <div className="step-head">
              <span className="step-num">3</span>
              <h2>Options</h2>
            </div>
            <div className="options">
              <div className="field">
                <span>Scope</span>
                <div className="segmented" role="radiogroup" aria-label="Scope">
                  {TIERS.map((t) => (
                    <label key={t.id}>
                      <input type="radio" name="tier" value={t.id} checked={tier === t.id} onChange={() => setTier(t.id)} />
                      {t.label} <span className="muted">· {t.detail}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Leave empty to let the design name it" />
              </label>
              <label className="field">
                <span>Style references</span>
                <input value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="e.g. Celeste, Dead Cells" />
                <span className="hint">Used privately to pick a look; never named in the game.</span>
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              <span>
                <strong>Dry run</strong> <span className="muted">· no model calls: the genre&apos;s exemplar design goes through the real gates (no API key needed)</span>
              </span>
            </label>
            <TrainingConsent />
          </section>

          {error ? (
            <div className="callout" data-tone="err" role="alert">
              {error}
            </div>
          ) : null}
          <div className="cluster">
            <button type="submit" className="btn-primary btn-lg" disabled={busy} data-testid="create">
              {busy ? 'Creating…' : 'Create game'}
            </button>
            <span className="muted small">You land in the workspace and can watch every stage.</span>
          </div>
        </form>

        <aside className="panel sticky">
          <h2>What happens next</h2>
          <ol className="pipeline">
            {PIPELINE.map(([name, text]) => (
              <li key={name}>
                <span>
                  <strong>{name}</strong>
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}
