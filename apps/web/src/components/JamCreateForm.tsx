'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { GENRES } from '@/lib/genres';

/** <input type="datetime-local"> wants local time without a zone. */
const local = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Moderators: a new jam with a theme, optional genres and its three moments (local time). */
export function JamCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState({ slug: '', title: '', theme: '', description: '', startsAt: '', submissionsClose: '', votingClose: '' });
  const [genres, setGenres] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Defaults on the client only, so the server render and hydration agree.
    const now = Date.now();
    setForm((f) => ({ ...f, startsAt: local(now), submissionsClose: local(now + 2 * 86_400_000), votingClose: local(now + 4 * 86_400_000) }));
  }, []);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const iso = (v: string) => (v ? new Date(v).toISOString() : '');
    const res = await fetch('/api/jams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, genres, startsAt: iso(form.startsAt), submissionsClose: iso(form.submissionsClose), votingClose: iso(form.votingClose) }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string; jam?: { slug: string } };
    setBusy(false);
    if (res.ok && body.jam) router.push(`/jams/${body.jam.slug}`);
    else setError(body.error ?? `could not create the jam (${res.status})`);
  }

  return (
    <form className="panel create" onSubmit={submit} data-testid="jam-create">
      <h2>New jam</h2>
      <div className="row">
        <label>
          Title
          <input value={form.title} onChange={set('title')} required minLength={3} maxLength={80} />
        </label>
        <label>
          Slug (the address)
          <input value={form.slug} onChange={set('slug')} required pattern="[a-z0-9][a-z0-9-]{2,39}" placeholder="tiny-worlds" />
        </label>
        <label>
          Theme
          <input value={form.theme} onChange={set('theme')} required minLength={2} maxLength={80} />
        </label>
      </div>
      <label>
        Description
        <textarea rows={2} value={form.description} onChange={set('description')} maxLength={2000} />
      </label>
      <div className="row">
        {GENRES.map(({ id, label }) => (
          <label key={id} className="check">
            <input type="checkbox" checked={genres.includes(id)} onChange={(e) => setGenres(e.target.checked ? [...genres, id] : genres.filter((x) => x !== id))} /> {label}
          </label>
        ))}
        <span className="muted">(none: any genre)</span>
      </div>
      <div className="row">
        <label>
          Entries open
          <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required />
        </label>
        <label>
          Submissions close
          <input type="datetime-local" value={form.submissionsClose} onChange={set('submissionsClose')} required />
        </label>
        <label>
          Voting closes
          <input type="datetime-local" value={form.votingClose} onChange={set('votingClose')} required />
        </label>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create jam'}
      </button>
    </form>
  );
}
