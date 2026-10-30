import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Objectives, parseAnyGdd, type EntityRoster, type LevelJson, type LevelProof, type StyleCard, type SystemsFile, type SystemsJson } from '@gg/schemas';
import { createSim, type FeedbackBinding } from '@gg/sdk';
import { type GenreManifest, type LevelGenParams, levelPlan, levelTicksOf, rolesPresent, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { BASE_MANIFESTS, checkFreeformObjectives, freeformManifest, IDENTITY_ROSTER, proveLevel, type FreeformExample } from '@gg/template-freeform/node';
import { catalogFor, genre as genreOf } from '@gg/templates/node';
import { checkComposition, checkSystems, parseFrontmatter, type Issue } from '@gg/validators';
import * as F from './files.js';

export interface ScaffoldOptions {
  outDir: string;
  genre: string;
  gameId: string;
  title: string;
  systems: SystemsFile;
  style: StyleCard;
  gddMarkdown: string;
  /** Number of generated levels (platformer) when no content is supplied; survivors always gets one arena. */
  levels?: number;
  seed?: number;
  /** Link node_modules from @gg/game-base so the game builds outside the workspace. */
  linkNodeModules?: boolean;
  /** A freeform game's roster (content/entities.json); without one, its base genre's entities under their own names. */
  roster?: EntityRoster;
  /** Content files the design stages wrote, by key (content/<key>.json): a freeform game's objectives. */
  content?: Record<string, unknown>;
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

/**
 * Emit a complete, buildable game package from the design artifacts: a curated genre's, or a freeform game composed at
 * load from its systems and roster on its base genre, whose solver replays the proofs the scaffold records.
 */
export function scaffold(opts: ScaffoldOptions): ScaffoldResult {
  const systems = opts.systems;
  const freeform = systems.genre === 'freeform' ? systems : null;
  const roster = opts.roster ?? IDENTITY_ROSTER;
  const g: GenreManifest = freeform ? freeformManifest(freeform, roster) : genreOf(opts.genre);
  const out = resolve(opts.outDir);
  const files: string[] = [];
  const seed = opts.seed ?? 1;
  const fm = parseFrontmatter(opts.gddMarkdown);
  const gdd = fm ? parseAnyGdd(fm.data) : null;
  if (!gdd?.success) throw new Error(`gdd.md front matter is invalid: ${gdd?.error.issues.map((i) => i.message).join('; ') ?? 'missing'}`);
  if ((gdd.data.genre === 'freeform') !== Boolean(freeform)) throw new Error('gdd.md and systems.json disagree on whether the game is freeform');
  const issues: Issue[] = [...checkSystems(systems, catalogFor(systems), gdd.data).issues];
  if (freeform) {
    // The composition rules hold a freeform game together, over its roster's roles and the content it ships.
    const content = [...Object.keys(g.extraContent?.({ seed, difficulty: 0.3 }) ?? {}), ...Object.keys(opts.content ?? {})];
    issues.push(...checkComposition(Object.values(g.systems).map((m) => m.meta), { roles: rolesPresent(g), content }).issues);
    if (opts.content?.['objectives'] !== undefined) {
      const objectives = Objectives.safeParse(opts.content['objectives']);
      if (!objectives.success) throw new Error(`content/objectives.json is invalid: ${objectives.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      issues.push(...checkFreeformObjectives(freeform, roster, objectives.data).issues);
    }
  }
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(`systems.json rejected: ${errors.map((i) => i.message).join('; ')}`);
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
      // A freeform game records its levels' winning runs with its own code (tests/unit/prove.test.ts).
      ...(freeform ? { prove: 'GG_PROVE=1 vitest run tests/unit/prove.test.ts' } : {}),
    },
  }, null, 2) + '\n');
  write(files, out, 'index.html', F.INDEX_HTML(opts.title));
  write(files, out, 'vite.config.ts', F.VITE_CONFIG);
  write(files, out, 'tsconfig.json', F.TSCONFIG);
  write(files, out, 'eslint.config.js', F.ESLINT_CONFIG);
  write(files, out, 'vitest.config.ts', F.VITEST_CONFIG);
  write(files, out, 'scripts/finish-build.mjs', F.FINISH_BUILD);
  // A freeform game is drawn in its base genre's setting.
  write(files, out, 'src/main.ts', F.MAIN_TS(opts.gameId, freeform ? freeform.composition.base : g.id, opts.title));
  write(files, out, 'src/game.ts', freeform ? F.FREEFORM_GAME_TS(freeform.composition.base) : F.GAME_TS(g.id, runtimeImport, runtimeName));
  write(files, out, 'src/systems/index.ts', F.SYSTEMS_INDEX);
  write(files, out, 'tests/unit/bots.ts', freeform ? F.FREEFORM_BOTS_TS : F.BOTS_TS(`${runtimeImport}/node`, manifestName));
  write(files, out, 'tests/unit/game.test.ts', F.GAME_TEST(g.id));
  if (freeform) write(files, out, 'tests/unit/prove.test.ts', F.FREEFORM_PROVE_TEST);
  write(files, out, 'design/gdd.md', opts.gddMarkdown.endsWith('\n') ? opts.gddMarkdown : `${opts.gddMarkdown}\n`);
  write(files, out, 'design/systems.json', JSON.stringify(opts.systems, null, 2) + '\n');
  write(files, out, 'design/style.json', JSON.stringify(opts.style, null, 2) + '\n');
  // The GDD's table binds the fixed events; the genre adds its own custom ones (a finisher, a boss slam, a door).
  const feedback: FeedbackBinding[] = [...(gdd.data.feedbackEvents as FeedbackBinding[])];
  for (const x of g.feedbackExtras ?? []) if (!feedback.some((f) => f.event === x.event)) feedback.push(x as FeedbackBinding);
  write(files, out, 'design/feedback.json', JSON.stringify(feedback, null, 2) + '\n');
  write(files, out, 'design/mechanics.json', F.MECHANICS_JSON);
  write(files, out, 'design/deviations.md', F.DEVIATIONS_MD);
  write(files, out, 'assets/manifest.json', F.ASSET_MANIFEST);
  write(files, out, 'assets/requests.json', F.ASSET_REQUESTS);
  mkdirSync(join(out, 'content', 'behaviour'), { recursive: true });
  mkdirSync(join(out, 'content', 'rules'), { recursive: true });
  mkdirSync(join(out, 'content', 'levels'), { recursive: true });
  mkdirSync(join(out, 'reports'), { recursive: true });
  if (freeform) write(files, out, 'content/entities.json', JSON.stringify(roster, null, 2) + '\n');
  for (const [key, value] of Object.entries(opts.content ?? {})) write(files, out, `content/${key}.json`, JSON.stringify(value, null, 2) + '\n');

  // Content placeholders from the genre's generators, as the shared level plan lays them out (count, ramp, boss floor).
  const levels: string[] = [];
  const feel = g.feelPresets[opts.systems.feelPreset] ?? g.feelPresets[g.defaultFeel]!;
  // Oracle: the static validator, then a win at the seed the level gets in the game (same wiring as src/game.ts): the
  // genre's solver bot, or for a freeform game a recorded proof (its base genre's solver, else the explorer), which the
  // game's own test then replays.
  const solver = freeform ? BASE_MANIFESTS[freeform.composition.base].bots[BASE_MANIFESTS[freeform.composition.base].solverBot] : g.bots[g.solverBot];
  if (!solver) throw new Error(`genre ${g.id} names unknown solver bot '${g.solverBot}'`);
  const proofs: LevelProof[] = [];
  const accept = (level: LevelJson, content: Record<string, unknown>, index: number, playSeed: number): boolean => {
    if (!g.levelGrammar.validate(level, feel).ok) return false;
    // What the level's generator makes (an arena's waves) is written over the design stages' files, so it wins here too.
    const all = { ...opts.content, ...content };
    if (freeform) {
      const r = proveLevel(level, index, { file: freeform, roster, behaviours: g.defaultBehaviours, content: all, feedback, solver, budget: 20_000 });
      if (r.proof) proofs.push(r.proof);
      return r.proof !== null;
    }
    const so = simOptionsFor(g, systems, { behaviours: g.defaultBehaviours, content: all, feedback });
    return runBot(createSim({ ...so, level, seed: playSeed }), solver, levelTicksOf(so)).completed;
  };
  const arena = g.levelGrammar.kind === 'arena';
  const plan = levelPlan(g.levelGrammar.kind, { levels: opts.levels ?? gdd.data.scope.levels, bosses: gdd.data.scope.bosses, tier: gdd.data.scopeTier });
  let s = seed;
  for (const slot of plan) {
    const paramsAt = (genSeed: number): LevelGenParams => (arena ? { seed: genSeed, difficulty: slot.difficulty } : { seed: genSeed, difficulty: slot.difficulty, boss: slot.boss });
    // The level as the game ships it (its id is what proofs and the editor know it by).
    const named = (l: LevelJson): LevelJson => (arena ? { ...l, id: 'arena', name: 'Arena' } : { ...l, id: slot.id, name: `Level ${slot.index + 1}`, ramp: { segment: slot.index, difficulty: slot.difficulty } });
    let params = paramsAt(s);
    let level = named(g.levelGrammar.generate(params));
    // Arena genres generate their content (waves) with the level; level-based genres ship none.
    let content = arena ? (g.extraContent?.(params) ?? {}) : {};
    let tries = 0;
    while (!accept(level, content, slot.index, slot.seed)) {
      if (++tries >= 20) throw new Error(`no seed from ${s - tries + 1} to ${s} gives ${slot.id} a level that passes the validator and ${freeform ? 'gets a winning run' : `the ${g.solverBot} bot`} at difficulty ${slot.difficulty}`);
      params = paramsAt(++s);
      level = named(g.levelGrammar.generate(params));
      content = arena ? (g.extraContent?.(params) ?? {}) : {};
    }
    s++;
    const n = String(slot.index + 1).padStart(2, '0');
    write(files, out, `content/levels/L${n}-${arena ? 'arena' : slot.id}.json`, JSON.stringify(level, null, 2) + '\n');
    for (const [key, value] of Object.entries(content)) write(files, out, `content/${key}.json`, JSON.stringify(value, null, 2) + '\n');
    levels.push(slot.id);
  }
  for (const p of proofs) write(files, out, `content/proofs/${p.level}.json`, JSON.stringify(p) + '\n');
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

/**
 * One of the hand-made freeform example games scaffolded as the worker builds it: its GDD, systems, roster, rules and
 * the content its idea decides (its crops, its cast's look), its levels proven. A showcase, and the pins' input.
 */
export function scaffoldExample(ex: FreeformExample, outDir: string, opts: { seed?: number; style?: StyleCard; linkNodeModules?: boolean } = {}): ScaffoldResult {
  const body = '## Concept\nx\n\n## Pillars\nx\n\n## Core loop\nx\n\n## Progression\nx\n\n## Scope\nx\n\n## Feedback\nx\n';
  return scaffold({
    outDir,
    genre: 'freeform',
    gameId: `pin-${ex.id}`,
    title: ex.gdd.title,
    systems: ex.systems,
    roster: ex.roster,
    content: { ...(ex.objectives ? { objectives: ex.objectives } : {}), ...ex.content },
    style: opts.style ?? DEFAULT_STYLE,
    gddMarkdown: `---\n${JSON.stringify(ex.gdd)}\n---\n${body}`,
    seed: opts.seed ?? 5,
    linkNodeModules: opts.linkNodeModules ?? true,
  });
}

