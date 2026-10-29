import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lineDiff, sourceView, untarGz, viewable } from './source';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const LONG = `src/systems/${'deeply-nested/'.repeat(8)}long-named-system.ts`;

/** A game directory tarred the way the worker's checkpoint does it (tar -czf - -C dir .), in GNU or POSIX format. */
function checkpoint(files: Record<string, string>, format: 'gnu' | 'posix' = 'gnu'): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'gg-source-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const r = spawnSync('tar', ['-czf', '-', `--format=${format}`, '-C', dir, '.'], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return new Uint8Array(r.stdout);
}

const game = {
  'src/game.ts': 'export const game = 1;\n',
  'src/systems/index.ts': 'export const systems = [];\n',
  [LONG]: 'export const deep = true;\n',
  'content/levels/L01-l01.json': '{\n  "id": "l01",\n  "rows": 3\n}\n',
  'design/gdd.md': '# GDD\n',
  'design/concept.md': '# Concept\n- Style references (private): Celeste\n',
  'design/edit-request.json': '{"message":"make it like Celeste"}',
  'provenance.json': '{"prompts":[]}',
  'bundle/game.js': 'minified();',
  'reports/gate-scaffold.json': '{}',
  'reports/shot.png': 'PNG',
  'tests/unit/game.test.ts': 'test();\n',
  'package.json': '{}\n',
};

describe('checkpoint source', () => {
  it('reads GNU and POSIX tarballs, long paths included', () => {
    for (const format of ['gnu', 'posix'] as const) {
      const files = untarGz(checkpoint(game, format));
      expect([...files.keys()].sort()).toEqual(Object.keys(game).sort());
      expect(new TextDecoder().decode(files.get(LONG))).toBe('export const deep = true;\n');
    }
  });

  it('shows source, content, design, tests and config, never the private concept, job input, provenance, builds or reports', () => {
    expect(viewable('src/game.ts')).toBe('code');
    expect(viewable('content/levels/L01-l01.json')).toBe('content');
    expect(viewable('design/gdd.md')).toBe('design');
    expect(viewable('tests/unit/game.test.ts')).toBe('test');
    expect(viewable('vite.config.ts')).toBe('config');
    for (const hidden of ['design/concept.md', 'design/edit-request.json', 'provenance.json', 'bundle/game.js', 'reports/gate-scaffold.json', 'reports/shot.png', 'assets/atlas.png', '.env']) expect(viewable(hidden), hidden).toBeNull();
    const view = sourceView(untarGz(checkpoint(game)), null);
    expect(view.files.map((f) => f.path)).toEqual(['src/game.ts', LONG, 'src/systems/index.ts', 'content/levels/L01-l01.json', 'design/gdd.md', 'tests/unit/game.test.ts', 'package.json']);
    expect(view.files.every((f) => f.status === null)).toBe(true);
  });

  it('marks changed, added and removed files against the previous version, with a line diff', () => {
    const before = untarGz(checkpoint(game));
    const after = untarGz(
      checkpoint({ ...Object.fromEntries(Object.entries(game).filter(([p]) => p !== 'src/systems/index.ts')), 'content/levels/L01-l01.json': '{\n  "id": "l01",\n  "rows": 4\n}\n', 'src/systems/dash.ts': 'export const dash = 2;\n' }),
    );
    const view = sourceView(after, before);
    const status = Object.fromEntries(view.files.map((f) => [f.path, f.status]));
    expect(status).toMatchObject({ 'src/game.ts': 'same', 'src/systems/dash.ts': 'added', 'content/levels/L01-l01.json': 'changed' });
    expect(view.removed).toEqual(['src/systems/index.ts']);
    const level = view.files.find((f) => f.path === 'content/levels/L01-l01.json')!;
    expect(level.diff?.filter((d) => d.op !== ' ')).toEqual([
      { op: '-', text: '  "rows": 3' },
      { op: '+', text: '  "rows": 4' },
    ]);
    expect(view.files.find((f) => f.path === 'src/game.ts')).not.toHaveProperty('diff');
  });
});

describe('lineDiff', () => {
  it('keeps the common head and tail and orders removals before additions', () => {
    const d = lineDiff('a\nb\nc\nd', 'a\nx\nc\nd\ne')!;
    expect(d.map((l) => `${l.op}${l.text}`)).toEqual([' a', '-b', '+x', ' c', ' d', '+e']);
    expect(lineDiff('same\ntext', 'same\ntext')!.every((l) => l.op === ' ')).toBe(true);
  });

  it('gives up on a changed middle too large to compare', () => {
    const big = (k: number) => Array.from({ length: 3000 }, (_, i) => `${k}:${i}`).join('\n');
    expect(lineDiff(big(1), big(2))).toBeNull();
    expect(lineDiff(big(1), big(2), 10_000_000)).not.toBeNull();
  });
});
