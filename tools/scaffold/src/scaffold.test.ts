import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, HEIST, type FreeformExample } from '@gg/template-freeform';
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

/** A freeform example scaffolded as the worker would: its GDD, systems, roster and objectives. */
function scaffoldExample(ex: FreeformExample, out: string, link: boolean) {
  const body = '## Concept\nx\n\n## Pillars\nx\n\n## Core loop\nx\n\n## Progression\nx\n\n## Scope\nx\n\n## Feedback\nx\n';
  return scaffold({
    outDir: out,
    genre: 'freeform',
    gameId: `pin-${ex.id}`,
    title: ex.gdd.title,
    systems: ex.systems,
    roster: ex.roster,
    content: ex.objectives ? { objectives: ex.objectives } : {},
    style: DEFAULT_STYLE,
    gddMarkdown: `---\n${JSON.stringify(ex.gdd)}\n---\n${body}`,
    seed: 5,
    linkNodeModules: link,
  });
}

describe('scaffold output is pinned for the freeform examples', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id} files are unchanged`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-pin-${ex.id}-`));
      const result = scaffoldExample(ex, out, false);
      const files: Record<string, string> = {};
      for (const f of [...result.files].sort()) files[f] = readFileSync(join(out, f), 'utf8');
      // Every level ships with a recorded winning run at the seed it is played with.
      for (const [i, id] of result.levels.entries()) {
        const level = Object.keys(files).find((f) => f.startsWith('content/levels/') && f.includes(`L${String(i + 1).padStart(2, '0')}-`))!;
        const levelId = (JSON.parse(files[level]!) as { id: string }).id;
        expect(JSON.parse(files[`content/proofs/${levelId}.json`] ?? 'null'), `${ex.id}/${id}`).toMatchObject({ level: levelId, seed: i + 1 });
      }
      expect(files).toMatchSnapshot();
    });
  }
});

describe('scaffold', () => {
  it('emits a freeform game that typechecks, lints, replays its proofs in its own test and builds', () => {
    const out = mkdtempSync(join(tmpdir(), 'gg-scaffold-freeform-'));
    const result = scaffoldExample(HEIST, out, true);
    expect(result.files).toContain('content/entities.json');
    for (const [script, label] of [['typecheck', 'typecheck'], ['lint', 'lint'], ['test', 'test'], ['build', 'build']] as const) {
      const r = run('pnpm', ['run', script], out);
      expect(r.ok, `${label} failed:\n${r.out.slice(-3000)}`).toBe(true);
    }
    expect(existsSync(join(out, 'dist', 'game.js'))).toBe(true);
  });

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
