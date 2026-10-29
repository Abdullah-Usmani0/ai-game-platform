import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, defaultSystems, scaffold } from './scaffold.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const sampleGdd = (genre: string) => readFileSync(join(root, 'samples', genre, 'design', 'gdd.md'), 'utf8');

function run(cmd: string, args: string[], cwd: string): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

describe('scaffold output is pinned for curated genres', () => {
  // Part of the golden lock: what a curated game is made of may only change on purpose (update with vitest -u).
  for (const genre of ['platformer', 'survivors', 'topdown-action', 'shmup', 'metroidvania', 'puzzle'] as const) {
    it(`${genre} files are unchanged`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-pin-${genre}-`));
      const result = scaffold({
        outDir: out,
        genre,
        gameId: `pin-${genre}`,
        title: `Pin ${genre}`,
        systems: defaultSystems(genre, genre === 'platformer' || genre === 'metroidvania' ? ['pickups', 'combat-stomp'] : genre === 'puzzle' ? [] : ['pickups']),
        style: DEFAULT_STYLE,
        gddMarkdown: sampleGdd(genre),
        levels: 2,
        seed: 5,
        linkNodeModules: false,
      });
      const files: Record<string, string> = {};
      for (const f of [...result.files].sort()) files[f] = readFileSync(join(out, f), 'utf8');
      expect(files).toMatchSnapshot();
    });
  }
});

describe('scaffold', () => {
  for (const genre of ['platformer', 'survivors', 'topdown-action', 'shmup', 'metroidvania', 'puzzle'] as const) {
    it(`emits a ${genre} game that typechecks, lints, tests and builds`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-${genre}-`));
      const result = scaffold({
        outDir: out,
        genre,
        gameId: `test-${genre}`,
        title: `Test ${genre}`,
        systems: defaultSystems(genre, genre === 'platformer' || genre === 'metroidvania' ? ['pickups', 'combat-stomp'] : genre === 'puzzle' ? [] : ['pickups']),
        style: DEFAULT_STYLE,
        gddMarkdown: sampleGdd(genre),
        levels: 2,
        seed: 5,
      });
      expect(result.files.length).toBeGreaterThan(15);
      expect(existsSync(join(out, 'node_modules', '@gg', 'sdk'))).toBe(true);
      for (const [script, label] of [['typecheck', 'typecheck'], ['lint', 'lint'], ['test', 'test'], ['build', 'build']] as const) {
        const r = run('pnpm', ['run', script], out);
        expect(r.ok, `${label} failed:\n${r.out.slice(-3000)}`).toBe(true);
      }
      expect(existsSync(join(out, 'dist', 'game.js'))).toBe(true);
      expect(existsSync(join(out, 'dist', 'engine.js'))).toBe(true);
    });
  }
});
