'use client';

import { useEffect, useState, type ReactNode } from 'react';

type Kind = 'code' | 'content' | 'design' | 'test' | 'config';
interface DiffLine {
  op: ' ' | '+' | '-';
  text: string;
}
interface SourceFile {
  path: string;
  kind: Kind;
  bytes: number;
  text: string;
  status: 'same' | 'changed' | 'added' | null;
  diff?: DiffLine[] | null;
}
interface SourceView {
  versionId: string;
  number: number;
  previous: { id: string; number: number } | null;
  files: SourceFile[];
  removed: string[];
}

const GROUPS: Array<[Kind, string]> = [
  ['code', 'Systems and code'],
  ['content', 'Levels and data'],
  ['design', 'Design'],
  ['test', 'Tests'],
  ['config', 'Config'],
];
/** Unchanged lines kept around each change; longer unchanged runs fold into one row. */
const CONTEXT = 3;

function fold(diff: readonly DiffLine[]): Array<DiffLine | { folded: number }> {
  const out: Array<DiffLine | { folded: number }> = [];
  for (let i = 0; i < diff.length; ) {
    if (diff[i]!.op !== ' ') {
      out.push(diff[i]!);
      i++;
      continue;
    }
    let j = i;
    while (j < diff.length && diff[j]!.op === ' ') j++;
    const run = diff.slice(i, j);
    const head = i === 0 ? 0 : CONTEXT;
    const tail = j === diff.length ? 0 : CONTEXT;
    if (run.length > head + tail + 1) out.push(...run.slice(0, head), { folded: run.length - head - tail }, ...run.slice(run.length - tail));
    else out.push(...run);
    i = j;
  }
  return out;
}

function diffRows(diff: readonly DiffLine[]): ReactNode[] {
  let oldLine = 1;
  let newLine = 1;
  return fold(diff).map((row, k) => {
    if ('folded' in row) {
      oldLine += row.folded;
      newLine += row.folded;
      return (
        <div key={k} className="line folded">
          <span className="ln" />⋯ {row.folded} unchanged line{row.folded === 1 ? '' : 's'}
        </div>
      );
    }
    const n = row.op === '-' ? oldLine : newLine;
    if (row.op !== '+') oldLine++;
    if (row.op !== '-') newLine++;
    return (
      <div key={k} className={row.op === '+' ? 'line add' : row.op === '-' ? 'line del' : 'line'} data-op={row.op}>
        <span className="ln">{n}</span>
        {row.op === ' ' ? ' ' : row.op} {row.text}
      </div>
    );
  });
}

/**
 * The game's source in the workspace: systems, levels and behaviour data, design files, tests and config of a version's
 * checkpoint, with what changed since the version it was built on. "Ask for a change" starts an edit about the file.
 */
export function CodeView({ gameId, headId, versions, onAsk }: { gameId: string; headId: string | null; versions: Array<{ id: string; number: number; kind: string }>; onAsk: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [view, setView] = useState<SourceView | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !headId) return;
    let cancelled = false;
    setError('');
    void fetch(`/api/games/${gameId}/source${versionId ? `?version=${versionId}` : ''}`, { cache: 'no-store' }).then(async (r) => {
      const body = (await r.json().catch(() => ({}))) as SourceView & { error?: string };
      if (cancelled) return;
      if (!r.ok) {
        setView(null);
        setError(body.error ?? `could not load the source (${r.status})`);
        return;
      }
      setView(body);
      setPath((p) => (p && body.files.some((f) => f.path === p) ? p : (body.files.find((f) => f.status === 'changed' || f.status === 'added') ?? body.files.find((f) => f.kind === 'code') ?? body.files[0])?.path ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [open, versionId, headId, gameId]);

  const file = view?.files.find((f) => f.path === path) ?? null;
  const accepted = versions.filter((v) => v.kind !== 'stage');
  return (
    <div className="panel code-view" data-testid="code-view">
      <h2>Code</h2>
      {!open ? (
        <>
          <p className="muted">The game as the harness built it: systems in GlueTS, levels and behaviour as data, the design files, with what each edit changed.</p>
          <button onClick={() => setOpen(true)} disabled={!headId} data-testid="code-open">
            Show code
          </button>
        </>
      ) : (
        <>
          <div className="row">
            <label>
              Version{' '}
              <select value={versionId ?? ''} onChange={(e) => setVersionId(e.target.value || null)} data-testid="code-version">
                <option value="">head</option>
                {accepted.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.number}
                  </option>
                ))}
              </select>
            </label>
            {view ? <span className="muted">{view.previous ? `version ${view.number}, compared with #${view.previous.number}` : `version ${view.number}, the first`}</span> : null}
            <button onClick={() => setOpen(false)}>Hide</button>
          </div>
          {error ? <p className="err">{error}</p> : null}
          {view ? (
            <div className="code-layout" data-testid="code-loaded" data-version={view.versionId}>
              <nav className="code-files">
                {GROUPS.map(([kind, label]) => {
                  const files = view.files.filter((f) => f.kind === kind);
                  return files.length ? (
                    <div key={kind}>
                      <h3>{label}</h3>
                      <ul>
                        {files.map((f) => (
                          <li key={f.path}>
                            <button className={f.path === path ? 'file selected' : 'file'} title={f.path} onClick={() => setPath(f.path)} data-testid="code-file" data-path={f.path} data-status={f.status ?? ''}>
                              {f.path.replace(/^(src|content|design|tests)\//, '')}
                              {f.status === 'changed' || f.status === 'added' ? <span className={`badge ${f.status}`}>{f.status === 'added' ? 'new' : 'changed'}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })}
                {view.removed.length ? (
                  <div>
                    <h3>Removed</h3>
                    <ul>
                      {view.removed.map((p) => (
                        <li key={p} className="muted" data-testid="code-removed">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </nav>
              {file ? (
                <div className="code-file-view">
                  <div className="row">
                    <strong data-testid="code-path">{file.path}</strong>
                    <span className="muted">{file.bytes} bytes</span>
                    {file.diff ? (
                      <button onClick={() => setShowDiff(!showDiff)} data-testid="code-diff-toggle">
                        {showDiff ? 'Whole file' : 'Changes'}
                      </button>
                    ) : null}
                    <button onClick={() => onAsk(file.path)} data-testid="code-ask">
                      Ask for a change
                    </button>
                  </div>
                  {file.status === 'changed' && file.diff === null ? <p className="muted">Too large to compare; showing the whole file.</p> : null}
                  <pre className="code" data-testid="code-text" data-mode={file.diff && showDiff ? 'diff' : 'file'}>
                    {file.diff && showDiff
                      ? diffRows(file.diff)
                      : file.text.split('\n').map((line, i) => (
                          <div key={i} className="line">
                            <span className="ln">{i + 1}</span>
                            {line}
                          </div>
                        ))}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : !error ? (
            <p className="muted">Loading the source…</p>
          ) : null}
        </>
      )}
    </div>
  );
}
