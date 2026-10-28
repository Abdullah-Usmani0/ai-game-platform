'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const GENRES = [
  { id: 'platformer', label: 'Precision platformer', hint: 'Celeste-class feel: coyote time, jump buffer, dash, stomp.' },
  { id: 'survivors', label: 'Survivors arena', hint: 'Top-down, auto-attack, waves for sixty seconds.' },
  { id: 'topdown-action', label: 'Top-down action', hint: 'Rooms and doors, directional melee, dash, clear the floor to open the exit.' },
  { id: 'shmup', label: 'Vertical shooter', hint: 'Hold fire, dodge aimed bullets, survive the minute of waves.' },
];

/** New-game form: prompt, genre, scope tier, optional title and references; creates the game and its job. */
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

  return (
    <main>
      <h1>Create a game</h1>
      <p className="muted">Describe the game. The harness writes the design, selects systems, scaffolds, authors behaviour and levels, plays it with bots and publishes only when every gate passes.</p>
      <form className="create" onSubmit={submit}>
        <label>
          Describe your game
          <textarea required minLength={10} rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A tight cave platformer about a lantern-carrying mole who dashes through crumbling tunnels, with coins to collect and beetles to stomp." data-testid="prompt" />
        </label>
        <div className="genres">
          {GENRES.map((g) => (
            <label key={g.id} className={genre === g.id ? 'genre selected' : 'genre'}>
              <input type="radio" name="genre" value={g.id} checked={genre === g.id} onChange={() => setGenre(g.id)} />
              <strong>{g.label}</strong>
              <span className="muted">{g.hint}</span>
            </label>
          ))}
        </div>
        <div className="row">
          <label>
            Scope
            <select value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="small">small (3 levels)</option>
              <option value="medium">medium (6 levels)</option>
              <option value="large">large (10 levels)</option>
            </select>
          </label>
          <label>
            Title (optional)
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </label>
          <label>
            Style references (optional, comma separated)
            <input value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="Celeste, Dead Cells" />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run (no model calls: exemplar design, real gates; needs no API key)
        </label>
        {error ? <p className="err">{error}</p> : null}
        <button type="submit" disabled={busy} data-testid="create">
          {busy ? 'Creating…' : 'Create'}
        </button>
      </form>
    </main>
  );
}
