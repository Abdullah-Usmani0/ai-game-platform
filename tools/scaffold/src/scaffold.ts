import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { GddFrontmatter, type LevelJson, type StyleCard, type SystemsJson } from '@gg/schemas';
import { createSim, type FeedbackBinding } from '@gg/sdk';
import { type GenreManifest, type LevelGenParams, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { CATALOG, genre as genreOf } from '@gg/templates/node';
import { checkSystems, parseFrontmatter } from '@gg/validators';
import * as F from './files.js';

export interface ScaffoldOptions {
  outDir: string;
  genre: string;
  gameId: string;
  title: string;
  systems: SystemsJson;
  style: StyleCard;
  gddMarkdown: string;
  /** Number of generated levels (platformer) when no content is supplied; survivors always gets one arena. */
  levels?: number;
  seed?: number;
  /** Link node_modules from @gg/game-base so the game builds outside the workspace. */
  linkNodeModules?: boolean;
}

export interface ScaffoldResult {
  outDir: string;
  files: string[];
  levels: string[];
}

const DEFAULT_STYLE: StyleCard = {
  version: 1,
  name: 'default-16bit',
  family: '16bit',
  canvas: { w: 320, h: 180 },
  scale: 'integer',
  pixelArt: true,
  palette: { background: '#1b1b2f', mid: '#4f5d75', foreground: '#f2f2f2', accent: '#ffd166', danger: '#ef476f', ui: '#ffffff', extra: [] },
  outline: 'dark',
  animationFps: { character: 10, effects: 15 },
  camera: { follow: 'lerp', lerp: 0.12, deadzone: { w: 48, h: 24 }, maxShake: 0.5, zoom: 1 },
  typography: { font: 'press-start-2p', size: 8 },
  audioMood: ['chiptune'],
  postFx: { vignette: true, bloom: true, crt: false },
  references: [],
  negative: [],
};

export { DEFAULT_STYLE };

function write(files: string[], root: string, rel: string, content: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  files.push(rel);
}

function gameBaseNodeModules(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve('@gg/game-base/package.json');
  return join(dirname(pkg), 'node_modules');
}

/** Emit a complete, buildable game package for a genre from the design artifacts. */
export function scaffold(opts: ScaffoldOptions): ScaffoldResult {
  const g: GenreManifest = genreOf(opts.genre);
  const out = resolve(opts.outDir);
  const files: string[] = [];
  const seed = opts.seed ?? 1;
  const fm = parseFrontmatter(opts.gddMarkdown);
  const gdd = fm ? GddFrontmatter.safeParse(fm.data) : null;
  if (!gdd?.success) throw new Error(`gdd.md front matter is invalid: ${gdd?.error.issues.map((i) => i.message).join('; ') ?? 'missing'}`);
  const systemsCheck = checkSystems(opts.systems, CATALOG, gdd.data);
  if (!systemsCheck.ok) throw new Error(`systems.json rejected: ${systemsCheck.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`);
  mkdirSync(out, { recursive: true });

  const runtimeImport = `@gg/template-${g.id}`;
  const camel = g.id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const runtimeName = `${camel}Runtime`;
  const manifestName = camel;
  write(files, out, 'package.json', JSON.stringify({
    name: `game-${opts.gameId}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      typecheck: 'tsc --noEmit',
      lint: 'eslint .',
      test: 'vitest run',
      build: 'vite build && node scripts/finish-build.mjs',
    },
  }, null, 2) + '\n');
  write(files, out, 'index.html', F.INDEX_HTML(opts.title));
  write(files, out, 'vite.config.ts', F.VITE_CONFIG);
  write(files, out, 'tsconfig.json', F.TSCONFIG);
  write(files, out, 'eslint.config.js', F.ESLINT_CONFIG);
  write(files, out, 'vitest.config.ts', F.VITEST_CONFIG);
  write(files, out, 'scripts/finish-build.mjs', F.FINISH_BUILD);
  write(files, out, 'src/main.ts', F.MAIN_TS(opts.gameId, g.id, opts.title));
  write(files, out, 'src/game.ts', F.GAME_TS(g.id, runtimeImport, runtimeName));
  write(files, out, 'src/systems/index.ts', F.SYSTEMS_INDEX);
  write(files, out, 'tests/unit/bots.ts', F.BOTS_TS(`${runtimeImport}/node`, manifestName));
  write(files, out, 'tests/unit/game.test.ts', F.GAME_TEST(g.id));
  write(files, out, 'design/gdd.md', opts.gddMarkdown.endsWith('\n') ? opts.gddMarkdown : `${opts.gddMarkdown}\n`);
  write(files, out, 'design/systems.json', JSON.stringify(opts.systems, null, 2) + '\n');
  write(files, out, 'design/style.json', JSON.stringify(opts.style, null, 2) + '\n');
  // The GDD's table binds the fixed events; the genre adds its own custom ones (a finisher, a boss slam, a door).
  const feedback: FeedbackBinding[] = [...(gdd.data.feedbackEvents as FeedbackBinding[])];
  for (const x of g.feedbackExtras ?? []) if (!feedback.some((f) => f.event === x.event)) feedback.push(x as FeedbackBinding);
  write(files, out, 'design/feedback.json', JSON.stringify(feedback, null, 2) + '\n');
  write(files, out, 'design/deviations.md', F.DEVIATIONS_MD);
  write(files, out, 'assets/manifest.json', F.ASSET_MANIFEST);
  write(files, out, 'assets/requests.json', F.ASSET_REQUESTS);
  mkdirSync(join(out, 'content', 'behaviour'), { recursive: true });
  mkdirSync(join(out, 'content', 'rules'), { recursive: true });
  mkdirSync(join(out, 'content', 'levels'), { recursive: true });
  mkdirSync(join(out, 'reports'), { recursive: true });

  // Content placeholders from the genre's generators, validated and ramped.
  const levels: string[] = [];
  const feel = g.feelPresets[opts.systems.feelPreset] ?? g.feelPresets[g.defaultFeel]!;
  // Oracle: the static validator and the genre's solver bot (same wiring as the generated src/game.ts) must both pass.
  const solver = g.bots[g.solverBot];
  if (!solver) throw new Error(`genre ${g.id} names unknown solver bot '${g.solverBot}'`);
  const accept = (level: LevelJson, content: Record<string, unknown>): boolean => {
    if (!g.levelGrammar.validate(level, feel).ok) return false;
    const so = simOptionsFor(g, opts.systems, { behaviours: g.defaultBehaviours, content, feedback });
    return runBot(createSim({ ...so, level, seed: 1 }), solver, 90 * 60).completed;
  };
  if (g.levelGrammar.kind === 'arena') {
    let s = seed;
    let params: LevelGenParams = { seed: s, difficulty: 0.25 };
    let level = g.levelGrammar.generate(params);
    let content = g.extraContent?.(params) ?? {};
    let tries = 0;
    while (!accept(level, content)) {
      if (++tries >= 20) throw new Error(`no arena seed from ${seed} to ${s} is completable by the ${g.solverBot} bot`);
      params = { seed: ++s, difficulty: 0.25 };
      level = g.levelGrammar.generate(params);
      content = g.extraContent?.(params) ?? {};
    }
    level = { ...level, id: 'arena', name: 'Arena' };
    write(files, out, 'content/levels/L01-arena.json', JSON.stringify(level, null, 2) + '\n');
    levels.push('arena');
    for (const [key, value] of Object.entries(content)) write(files, out, `content/${key}.json`, JSON.stringify(value, null, 2) + '\n');
  } else {
    const count = Math.max(1, Math.min(opts.levels ?? gdd.data.scope.levels, 10));
    let s = seed;
    for (let i = 0; i < count; i++) {
      const difficulty = count === 1 ? 0.2 : 0.15 + (0.6 * i) / Math.max(3, count - 1);
      // A design with a boss gets it on the last level (generators without bosses ignore the parameter).
      const boss = gdd.data.scope.bosses > 0 && count > 1 && i === count - 1 ? 1 : 0;
      let level = g.levelGrammar.generate({ seed: s, difficulty, boss });
      let tries = 0;
      while (!accept(level, {})) {
        if (++tries >= 20) throw new Error(`no level seed from ${s - tries + 1} to ${s} passes the validator and the ${g.solverBot} bot at difficulty ${difficulty}`);
        s++;
        level = g.levelGrammar.generate({ seed: s, difficulty, boss });
      }
      s++;
      const id = `l${String(i + 1).padStart(2, '0')}`;
      level = { ...level, id, name: `Level ${i + 1}`, ramp: { segment: i, difficulty: Math.round(difficulty * 100) / 100 } };
      write(files, out, `content/levels/L${String(i + 1).padStart(2, '0')}-${id}.json`, JSON.stringify(level, null, 2) + '\n');
      levels.push(id);
    }
  }
  for (const b of g.defaultBehaviours) write(files, out, `content/behaviour/${b.id}.fsm.json`, JSON.stringify(b, null, 2) + '\n');

  if (opts.linkNodeModules ?? true) linkGameBase(out);
  return { outDir: out, files, levels };
}

/** Point <gameDir>/node_modules at @gg/game-base's node_modules (restores a checkpointed game too). */
export function linkGameBase(gameDir: string): void {
  const nm = join(gameDir, 'node_modules');
  try {
    if (lstatSync(nm)) rmSync(nm, { recursive: true, force: true });
  } catch {
    /* missing */
  }
  symlinkSync(gameBaseNodeModules(), nm, 'dir');
}

/** Minimal systems.json for a genre: every required system plus the listed optional ones, default params. */
export function defaultSystems(genreId: string, optional: string[] = []): SystemsJson {
  const g = genreOf(genreId);
  return systemsJsonFor(g, [...g.requiredSystems, ...optional.filter((o) => g.optionalSystems.includes(o))]);
}

export function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
