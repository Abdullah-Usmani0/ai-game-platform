import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, HEIST, LANTERN, type FreeformExample } from '@gg/template-freeform';
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
  for (const genre of ['platformer', 'survivors', 'topdown-action', 'shmup', 'metroidvania', 'puzzle', 'lifesim', 'castle'] as const) {
    it(`${genre} files are unchanged`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-pin-${genre}-`));
      const result = scaffold({
        outDir: out,
        genre,
        gameId: `pin-${genre}`,
        title: `Pin ${genre}`,
        systems: defaultSystems(genre, genre === 'platformer' || genre === 'metroidvania' || genre === 'castle' ? ['pickups', 'combat-stomp'] : genre === 'puzzle' ? [] : genre === 'lifesim' ? ['shop', 'sleep', 'energy'] : ['pickups']),
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

describe("a game's own content", () => {
  it("wins over what its genre ships: a castle game's own story is kept, its moves still shipped", () => {
    const out = mkdtempSync(join(tmpdir(), 'gg-scaffold-own-'));
    const own = { version: 1, nodes: [{ id: 'once', speaker: 'narrator', lines: ['Once, a bell.'] }], chapters: [{ level: 1, node: 'once' }] };
    scaffold({ outDir: out, genre: 'castle', gameId: 'own', title: 'Own', systems: defaultSystems('castle', []), style: DEFAULT_STYLE, gddMarkdown: sampleGdd('castle'), levels: 1, seed: 5, linkNodeModules: false, content: { dialogue: own } });
    expect(JSON.parse(readFileSync(join(out, 'content', 'dialogue.json'), 'utf8'))).toEqual(own);
    expect(existsSync(join(out, 'content', 'moves.json'))).toBe(true);
  });
});

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

  it("a freeform game with a bot of its own: levels no bot of the platform wins wait, until the game's own bot plays them", () => {
    const out = mkdtempSync(join(tmpdir(), 'gg-scaffold-own-bot-'));
    scaffoldPinned(LANTERN, out, true);
    // The bot-author skill's example: an owl that sends a moth moving in its sight back to the start (a system of the
    // game's own), and the moth's bot, which keeps still while the owl watches.
    const examples = join(root, 'harness', '.agents', 'skills', 'bot-author', 'examples');
    copyFileSync(join(examples, 'owl.ts'), join(out, 'src', 'systems', 'owl.ts'));
    copyFileSync(join(examples, 'mechanics.json'), join(out, 'design', 'mechanics.json'));
    writeFileSync(join(out, 'src', 'systems', 'index.ts'), "import type { SystemDef } from '@gg/sdk';\nimport { owl } from './owl.js';\n\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const BESPOKE: SystemDef<any>[] = [owl];\n");
    // Neither the solver nor the explorer keeps still while the owl watches: every level waits for a winning run.
    const alone = run('pnpm', ['run', 'prove'], out);
    expect(alone.ok, `prove failed:\n${alone.out.slice(-3000)}`).toBe(true);
    expect(alone.out).toMatch(/waiting for a winning run: l01 \(.*l02 \(.*l03 \(/s);
    copyFileSync(join(examples, 'moth.ts'), join(out, 'src', 'bots', 'moth.ts'));
    writeFileSync(join(out, 'src', 'bots', 'index.ts'), "import type { BotPolicy } from '@gg/template-core';\nimport { moth } from './moth.js';\n\nexport const GAME_BOTS: Record<string, BotPolicy> = { moth };\n");
    for (const script of ['typecheck', 'lint', 'prove', 'test']) {
      const r = run('pnpm', ['run', script], out);
      expect(r.ok, `${script} failed:\n${r.out.slice(-3000)}`).toBe(true);
    }
    const proofs = readdirSync(join(out, 'content', 'proofs')).map((f) => (JSON.parse(readFileSync(join(out, 'content', 'proofs', f), 'utf8')) as { by: string }).by);
    expect(proofs).toEqual(['bot', 'bot', 'bot']);
  });

  for (const genre of ['platformer', 'survivors', 'topdown-action', 'shmup', 'metroidvania', 'puzzle', 'lifesim', 'castle'] as const) {
    it(`emits a ${genre} game that typechecks, lints, tests and builds`, () => {
      const out = mkdtempSync(join(tmpdir(), `gg-scaffold-${genre}-`));
      const result = scaffold({
        outDir: out,
        genre,
        gameId: `test-${genre}`,
        title: `Test ${genre}`,
        systems: defaultSystems(genre, genre === 'platformer' || genre === 'metroidvania' || genre === 'castle' ? ['pickups', 'combat-stomp'] : genre === 'puzzle' ? [] : genre === 'lifesim' ? ['shop', 'sleep', 'energy'] : ['pickups']),
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
