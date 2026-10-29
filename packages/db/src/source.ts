import { gunzipSync } from 'node:zlib';

/**
 * The workspace code view: a version's checkpoint (the game directory as the worker tarred it) read back as the files a
 * creator can look at, each marked against the previous accepted version with a line diff where it changed.
 */

export type SourceKind = 'code' | 'content' | 'design' | 'test' | 'config';

export interface DiffLine {
  op: ' ' | '+' | '-';
  text: string;
}

export interface SourceFile {
  path: string;
  kind: SourceKind;
  bytes: number;
  text: string;
  /** Against the previous accepted version; null when there is none. */
  status: 'same' | 'changed' | 'added' | null;
  /** Changed files only; null when the file is too large to diff. */
  diff?: DiffLine[] | null;
}

export interface SourceView {
  files: SourceFile[];
  /** Viewable files the previous version had and this one does not. */
  removed: string[];
}

/** The largest file the view shows (generated levels are a few KB). */
export const MAX_SOURCE_BYTES = 256 * 1024;

const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|txt|ya?ml)$/;
/**
 * Never shown: concept.md can name the creator's private style references (and a remix carries its origin's), an edit
 * request is a job's own input, provenance can hold generation prompts; built output and reports are not source.
 */
const HIDDEN = [/^design\/concept\.md$/, /^design\/edit-request\.json$/, /(^|\/)provenance\.json$/, /^(bundle|dist|reports|node_modules)\//, /(^|\/)\./];

/** The kind a viewable path is shown under, or null for files the view leaves out. */
export function viewable(path: string): SourceKind | null {
  if (!TEXT.test(path) || HIDDEN.some((re) => re.test(path))) return null;
  if (path.startsWith('src/')) return 'code';
  if (path.startsWith('content/') || path.startsWith('assets/')) return 'content';
  if (path.startsWith('design/')) return 'design';
  if (path.startsWith('tests/')) return 'test';
  return 'config';
}

const cstr = (b: Uint8Array, start: number, len: number): string => {
  const slice = b.subarray(start, start + len);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end < 0 ? slice : slice.subarray(0, end));
};

/** Regular files of a tar.gz (ustar, GNU long names and pax paths), keyed by path without a leading ./. */
export function untarGz(bytes: Uint8Array): Map<string, Uint8Array> {
  const tar = gunzipSync(bytes);
  const files = new Map<string, Uint8Array>();
  let longName: string | null = null;
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((x) => x === 0)) break;
    const size = parseInt(cstr(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] ?? 0);
    const data = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = cstr(data, 0, data.length);
      continue;
    }
    if (type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(data));
      if (m) longName = m[1]!;
      continue;
    }
    // POSIX ustar ("ustar\0") splits long paths into prefix/name; GNU tar ("ustar ") keeps other fields there.
    const prefix = cstr(header, 257, 6) === 'ustar' && header[262] === 0 ? cstr(header, 345, 155) : '';
    const name = longName ?? (prefix ? `${prefix}/${cstr(header, 0, 100)}` : cstr(header, 0, 100));
    longName = null;
    if (type !== '0' && type !== '\0') continue;
    files.set(name.replace(/^\.\//, ''), data);
  }
  return files;
}

/** Line diff (LCS after trimming the common head and tail); null when the changed middle is too large to compare. */
export function lineDiff(before: string, after: string, maxCells = 2_000_000): DiffLine[] | null {
  const a = before.split('\n');
  const b = after.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let endA = a.length;
  let endB = b.length;
  while (endA > head && endB > head && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const x = a.slice(head, endA);
  const y = b.slice(head, endB);
  const n = x.length;
  const m = y.length;
  if (n * m > maxCells) return null;
  // lcs[i][j]: the longest common subsequence of x[i..] and y[j..].
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i * w + j] = x[i] === y[j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
  const out: DiffLine[] = a.slice(0, head).map((text) => ({ op: ' ', text }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      out.push({ op: ' ', text: x[i]! });
      i++;
      j++;
    } else if (i < n && (j === m || lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!)) {
      out.push({ op: '-', text: x[i]! });
      i++;
    } else {
      out.push({ op: '+', text: y[j]! });
      j++;
    }
  }
  out.push(...a.slice(endA).map((text): DiffLine => ({ op: ' ', text })));
  return out;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** The viewable files of a checkpoint, sorted by kind then path, marked against the previous version's files. */
export function sourceView(files: Map<string, Uint8Array>, previous: Map<string, Uint8Array> | null): SourceView {
  const order: SourceKind[] = ['code', 'content', 'design', 'test', 'config'];
  const out: SourceFile[] = [];
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);
  for (const [path, bytes] of files) {
    const kind = viewable(path);
    if (!kind || bytes.length > MAX_SOURCE_BYTES) continue;
    const text = decode(bytes);
    const before = previous?.get(path);
    const status = !previous ? null : !before ? 'added' : sameBytes(before, bytes) ? 'same' : 'changed';
    out.push({ path, kind, bytes: bytes.length, text, status, ...(status === 'changed' ? { diff: lineDiff(decode(before!), text) } : {}) });
  }
  out.sort((p, q) => order.indexOf(p.kind) - order.indexOf(q.kind) || p.path.localeCompare(q.path));
  const removed = previous ? [...previous.keys()].filter((p) => viewable(p) && !files.has(p)).sort() : [];
  return { files: out, removed };
}
