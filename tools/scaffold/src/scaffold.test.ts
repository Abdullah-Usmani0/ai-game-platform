import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, HEIST, type FreeformExample } from '@gg/template-freeform';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, defaultSystems, scaffold, scaffoldExample } from './scaffold.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const sampleGdd = (genre: string) => readFileSync(join(root, 'samples', genre, 'design', 'gdd.md'), 'utf8');

function run(cmd: string, args: string[], cwd: string): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

describe('scaffold output is pinned for curated genres', () => {
  // Part of the golden lock: what a curated game is made of may only change on purpose (update with vitest -u).
  for (const genre of ['platformer', 'survivors', 'topdown-action', 'shmup', 'metroidvania', 'puzzle', 'lifesim'] as const) {
    it(`${genre} files are unchanged`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-pin-${genre}-`));
      const result = scaffold({
        outDir: out,
        genre,
        gameId: `pin-${genre}`,
        title: `Pin ${genre}`,
        systems: defaultSystems(genre, genre === 'platformer' || genre === 'metroidvania' ? ['pickups', 'combat-stomp'] : genre === 'puzzle' ? [] : genre === 'lifesim' ? ['shop', 'sleep', 'energy'] : ['pickups']),
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

/** A freeform example scaffolded as the worker would (scaffoldExample), pinned at seed 5. */
const scaffoldPinned = (ex: FreeformExample, out: string, link: boolean) => scaffoldExample(ex, out, { linkNodeModules: link });

describe('scaffold output is pinned for the freeform examples', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id} files are unchanged`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-pin-${ex.id}-`));
      const result = scaffoldPinned(ex, out, false);
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
    const result = scaffoldPinned(HEIST, out, true);
    expect(result.files).toContain('content/entities.json');
    for (const [script, label] of [['typecheck', 'typecheck'], ['lint', 'lint'], ['test', 'test'], ['build', 'build']] as const) {
      const r = run('pnpm', ['run', script], out);
      expect(r.ok, `${label} failed:\n${r.out.slice(-3000)}`).toBe(true);
    }
    expect(existsSync(join(out, 'dist', 'game.js'))).toBe(true);
  });

  it('a freeform game with a system of its own: its test holds the code to the contract, and it records its own runs', () => {
    const out = mkdtempSync(join(tmpdir(), 'gg-scaffold-bespoke-'));
    scaffoldPinned(HEIST, out, true);
    // A steady current drags the player west: the runs recorded without it no longer win.
    writeFileSync(
      join(out, 'src', 'systems', 'current.ts'),
      [
        "import { defineSystem } from '@gg/sdk';",
        '',
        '/** A steady current that drags the player west, shown on the HUD. */',
        'export const current = defineSystem<{ ticks: number }>({',
        "  id: 'current',",
        '  init: () => ({ ticks: 0 }),',
        '  fixedUpdate(s, _input, ctx) {',
        '    const p = ctx.world.player;',
        '    if (!p.alive) return;',
        '    s.ticks++;',
        '    ctx.move(p, -0.25, 0);',
        "    ctx.world.hud['current'] = Math.floor(s.ticks / 60);",
        '  },',
        '});',
        '',
      ].join('\n'),
    );
    writeFileSync(join(out, 'src', 'systems', 'index.ts'), "import type { SystemDef } from '@gg/sdk';\nimport { current } from './current.js';\n\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const BESPOKE: SystemDef<any>[] = [current];\n");
    const contract = (hud: string[]) => writeFileSync(join(out, 'design', 'mechanics.json'), JSON.stringify({ version: 1, mechanics: [{ id: 'current', summary: 'A steady current that drags the player west.', emits: [], hud }] }));
    for (const script of ['typecheck', 'lint']) {
      const r = run('pnpm', ['run', script], out);
      expect(r.ok, `${script} failed:\n${r.out.slice(-3000)}`).toBe(true);
    }
    // A contract that leaves out the HUD key the code writes fails the game's test, saying which.
    contract([]);
    const loose = run('pnpm', ['run', 'test'], out);
    expect(loose.ok).toBe(false);
    expect(loose.out).toMatch(/current writes the HUD keys current, which its contract does not name/);
    // With the contract right, the runs recorded without the current are what fails, until the game proves itself.
    contract(['current']);
    const stale = run('pnpm', ['run', 'test'], out);
    expect(stale.ok, 'the runs recorded without the current still win').toBe(false);
    const proved = run('pnpm', ['run', 'prove'], out);
    expect(proved.ok, `prove failed:\n${proved.out.slice(-3000)}`).toBe(true);
    const fresh = run('pnpm', ['run', 'test'], out);
    expect(fresh.ok, `test failed after proving:\n${fresh.out.slice(-3000)}`).toBe(true);
  });

  for (const genre of ['platformer', 'survivors', 'topdown-action', 'shmup', 'metroidvania', 'puzzle', 'lifesim'] as const) {
    it(`emits a ${genre} game that typechecks, lints, tests and builds`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-${genre}-`));
      const result = scaffold({
        outDir: out,
        genre,
        gameId: `test-${genre}`,
        title: `Test ${genre}`,
        systems: defaultSystems(genre, genre === 'platformer' || genre === 'metroidvania' ? ['pickups', 'combat-stomp'] : genre === 'puzzle' ? [] : genre === 'lifesim' ? ['shop', 'sleep', 'energy'] : ['pickups']),
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
