import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityRoster, LevelJson, LevelProof, MechanicsFile, Objectives, parseAnyGdd, parseSystemsFile, SpriteSheet, StyleCard, type AnyGddFrontmatter, type BehaviourFsm, type EcaRule, type Mechanic, type SystemsFile } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed, type FeedbackBinding } from '@gg/sdk';
import { artPalette, settingFor, type Setting } from '@gg/sdk/art';
import { rolesPresent, simOptionsFor, type GenreManifest } from '@gg/template-core';
import { checkFreeformObjectives, FREEFORM_CATALOG, freeformDesignManifest, freeformManifest, IDENTITY_ROSTER } from '@gg/template-freeform/node';
import { checkComposition, checkSpriteSheet, checkSystems, err, mechanicMeta, parseFrontmatter, report, spriteCast, type CastMember, type Issue, type SystemsCatalog, type ValidationReport } from '@gg/validators';
import { CATALOG, genre, GENRES } from './genres.js';

/** What a game's design files say about it; a file that is missing or invalid is null (proofs: left out). */
export interface GameFiles {
  systems: SystemsFile | null;
  gdd: AnyGddFrontmatter | null;
  roster: EntityRoster | null;
  proofs: LevelProof[];
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Reads a game directory's design/systems.json, design/gdd.md front matter, content/entities.json and content/proofs/. */
export function readGameFiles(gameDir: string): GameFiles {
  const systems = parseSystemsFile(readJson(join(gameDir, 'design', 'systems.json')));
  const gddPath = join(gameDir, 'design', 'gdd.md');
  const fm = existsSync(gddPath) ? parseFrontmatter(readFileSync(gddPath, 'utf8')) : null;
  const gdd = fm ? parseAnyGdd(fm.data) : null;
  const roster = EntityRoster.safeParse(readJson(join(gameDir, 'content', 'entities.json')));
  const proofsDir = join(gameDir, 'content', 'proofs');
  const proofs = existsSync(proofsDir)
    ? readdirSync(proofsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .flatMap((f) => {
          const p = LevelProof.safeParse(readJson(join(proofsDir, f)));
          return p.success ? [p.data] : [];
        })
    : [];
  return { systems: systems.success ? systems.data : null, gdd: gdd?.success ? gdd.data : null, roster: roster.success ? roster.data : null, proofs };
}

/**
 * The manifest of a game: its curated genre's own, the very object the genre registry holds; or a freeform game's
 * composition on its base (its systems, roster and proofs), or before its systems are chosen, the base offering every
 * system that works with its movement. The request's genre is the last resort, for a game with no design files yet.
 */
export function manifestFor(files: Partial<GameFiles>, requestGenre?: string): GenreManifest {
  if (files.systems?.genre === 'freeform') return freeformManifest(files.systems, files.roster ?? IDENTITY_ROSTER, files.proofs ?? []);
  if (files.gdd?.genre === 'freeform') return freeformDesignManifest(files.gdd.base);
  const id = files.systems?.genre ?? files.gdd?.genre ?? requestGenre;
  if (!id) throw new Error('cannot determine the genre: no request, systems.json or gdd.md');
  if (id === 'freeform') throw new Error("a freeform game's base genre comes from its GDD, which is not written yet");
  return genre(id);
}

/** The manifest of the game in a directory (see manifestFor). */
export function resolveGame(gameDir: string, requestGenre?: string): GenreManifest {
  return manifestFor(readGameFiles(gameDir), requestGenre);
}

/** What a game's sim takes besides its systems and levels: behaviours, rules, content files (not the roster), feedback. */
export function readGameInputs(gameDir: string): { behaviours: BehaviourFsm[]; rules: EcaRule[]; content: Record<string, unknown>; feedback: FeedbackBinding[] } {
  const list = (dir: string, suffix: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(suffix)).sort().map((f) => join(dir, f)) : []);
  // Unlike the design files, an input the sim plays with cannot be skipped: a run proven without it proves another game.
  const read = (f: string): unknown => {
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as unknown;
    } catch (e) {
      throw new Error(`${f.slice(gameDir.length + 1)} is not valid JSON: ${(e as Error).message}`, { cause: e });
    }
  };
  const content: Record<string, unknown> = {};
  for (const f of list(join(gameDir, 'content'), '.json')) {
    const key = f.replace(/^.*\/([^/]+)\.json$/, '$1');
    if (key !== 'entities') content[key] = read(f);
  }
  const feedback = join(gameDir, 'design', 'feedback.json');
  return {
    behaviours: list(join(gameDir, 'content', 'behaviour'), '.fsm.json').map((f) => read(f) as BehaviourFsm),
    rules: list(join(gameDir, 'content', 'rules'), '.eca.json').map((f) => read(f) as EcaRule),
    content,
    feedback: existsSync(feedback) ? (read(feedback) as FeedbackBinding[]) : [],
  };
}

/** A game's levels in the order it plays them (content/levels/, sorted), each with the seed it is played at. */
export function readGameLevels(gameDir: string): Array<{ level: LevelJson; index: number; seed: number }> {
  const dir = join(gameDir, 'content', 'levels');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f, index) => ({ level: LevelJson.parse(readJson(join(dir, f))), index, seed: levelSeed(DEFAULT_SEED, index) }));
}

/** Whether a game has systems of its own (src/systems/*.ts beside the index): its own code then checks and proves them. */
export function hasBespokeSystems(gameDir: string): boolean {
  const dir = join(gameDir, 'src', 'systems');
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.ts') && f !== 'index.ts');
}

/**
 * A freeform game's proofs against the game as it is now: every level has a recorded winning run, recorded at the seed
 * the level is played with, that still wins. Replayed here unless the game has bespoke systems (the game's own test
 * replays those, with its code). A curated game passes: its genre's solver bot proves its levels.
 */
export function checkProofs(gameDir: string): ValidationReport {
  const files = readGameFiles(gameDir);
  const systems = files.systems;
  if (systems?.genre !== 'freeform') return report([], { curated: true });
  const m = manifestFor(files);
  const inputs = readGameInputs(gameDir);
  const bespoke = hasBespokeSystems(gameDir);
  const options = simOptionsFor(m, systems, inputs);
  const issues: Issue[] = [];
  let proven = 0;
  for (const { level, seed } of readGameLevels(gameDir)) {
    const proof = files.proofs.find((p) => p.level === level.id);
    if (!proof) issues.push(err('no_proof', `${level.id} has no recorded winning run (content/proofs/${level.id}.json)`, { path: level.id }));
    else if (proof.seed !== seed) issues.push(err('proof_seed', `${level.id}'s run was recorded at seed ${proof.seed}; the game plays it at ${seed}`, { path: level.id }));
    else if (!bespoke) {
      const sim = createSim({ ...options, level, seed });
      sim.run(proof.script, proof.ticks);
      if (sim.world.flags.won) proven++;
      else issues.push(err('stale_proof', `${level.id}'s recorded run (${proof.by}) no longer wins: the game changed since it was proven`, { path: level.id }));
    }
  }
  return report(issues, { proven, replayed: !bespoke });
}

/** The catalog a game's systems.json is checked against: its genre's, or for a freeform game every system's. */
export function catalogFor(systems: Pick<SystemsFile, 'genre'>): SystemsCatalog {
  return systems.genre === 'freeform' ? FREEFORM_CATALOG : CATALOG;
}

/** design/mechanics.json's contracts (none when the game has no such file); a file that does not parse is an error. */
export function readMechanics(gameDir: string, issues: Issue[]): Mechanic[] {
  const path = join(gameDir, 'design', 'mechanics.json');
  if (!existsSync(path)) return [];
  const parsed = MechanicsFile.safeParse(readJson(path));
  if (parsed.success) return parsed.data.mechanics;
  issues.push(...parsed.error.issues.map((i) => err('mechanics_invalid', `design/mechanics.json ${i.path.join('.') || '(root)'}: ${i.message}`)));
  return [];
}

/**
 * A game's design/systems.json against everything that holds it together: the catalog's ranges and the GDD's feedback
 * events; for a freeform game also the composition rules, over its roster's roles and the content it ships, and its
 * objectives. Content still to come counts as there: what its levels' generator writes with them (an arena's waves,
 * before the scaffold has run), and the rules the composition stage writes, until that stage has written the roster.
 * The contracts of the game's bespoke systems (design/mechanics.json) take part in the composition rules: for a curated
 * game, what they add to its own systems' check. The content the design stage wrote from the idea (a farm's crops) is
 * held to the rules these systems set.
 */
export function checkGameSystems(gameDir: string): ValidationReport {
  const path = join(gameDir, 'design', 'systems.json');
  if (!existsSync(path)) return report([err('systems_missing', 'design/systems.json missing')]);
  const parsed = parseSystemsFile(readJson(path));
  if (!parsed.success) return report(parsed.error.issues.map((i) => err('systems_schema', `${i.path.join('.')}: ${i.message}`)));
  const files = readGameFiles(gameDir);
  const catalog = catalogFor(parsed.data);
  const issues: Issue[] = [...checkSystems(parsed.data, catalog, files.gdd ?? undefined).issues];
  const mechanics = readMechanics(gameDir, issues);
  for (const m of mechanics) if (catalog[m.id]) issues.push(err('mechanic_shadows', `bespoke system '${m.id}' has the id of a catalog system`, { path: m.id }));
  const bespoke = mechanics.map(mechanicMeta);
  // A genre without a template has no runtime of its own: checkSystems has already said what is wrong with it.
  const own = parsed.data.genre === 'freeform' ? manifestFor(files) : GENRES[parsed.data.genre];
  const dir = join(gameDir, 'content');
  const written = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : [];
  const toCome = (m: GenreManifest) => Object.keys(m.extraContent?.({ seed: 1, difficulty: 0.3 }) ?? {});
  if (parsed.data.genre === 'freeform') {
    const m = own!;
    const composed = existsSync(join(dir, 'entities.json'));
    const content = [...new Set([...written, ...toCome(m), ...(composed ? [] : ['objectives'])])];
    issues.push(...checkComposition([...Object.values(m.systems).map((s) => s.meta), ...bespoke], { roles: rolesPresent(m), content }).issues);
    const objectivesPath = join(dir, 'objectives.json');
    if (existsSync(objectivesPath)) {
      const o = Objectives.safeParse(readJson(objectivesPath));
      if (o.success) issues.push(...checkFreeformObjectives(parsed.data, files.roster ?? IDENTITY_ROSTER, o.data).issues);
      else issues.push(...o.error.issues.map((i) => err('objectives_invalid', `content/objectives.json ${i.path.join('.')}: ${i.message}`)));
    }
  } else if (own && bespoke.length > 0) {
    // A curated genre's systems are held together by the genre; what the game's own add to the rules is its to answer.
    const ctx = { roles: rolesPresent(own), content: [...new Set([...written, ...toCome(own), ...(own.designContent ?? []).map((d) => d.key)])] };
    const metas = parsed.data.systems.flatMap((s) => (catalog[s.id] ? [catalog[s.id]!] : []));
    const before = new Set(checkComposition(metas, ctx).issues.map((i) => `${i.code}|${i.message}`));
    issues.push(...checkComposition([...metas, ...bespoke], ctx).issues.filter((i) => !before.has(`${i.code}|${i.message}`)));
  }
  for (const d of own?.designContent ?? []) {
    const path = join(gameDir, 'content', `${d.key}.json`);
    if (existsSync(path)) issues.push(...d.check(readJson(path), parsed.data));
  }
  return report(issues);
}

/** The setting a game is drawn in: its genre's, a freeform game's base genre's. */
export function settingOf(files: Partial<GameFiles>, g: GenreManifest): Setting {
  const base = files.systems?.genre === 'freeform' ? files.systems.composition.base : files.gdd?.genre === 'freeform' ? files.gdd.base : g.id;
  return settingFor(base, g.movementMode);
}

/** The types a game draws, the player first, each with what it is for and the shipped sprite it draws with. */
export function castOf(files: Partial<GameFiles>, requestGenre?: string): CastMember[] {
  const g = manifestFor(files, requestGenre);
  return spriteCast(g.entityDefs, { setting: settingOf(files, g), w: g.player.w });
}

/**
 * content/sprites.json, the game's own look for its cast, held to the art rules in the game's palette: a design for
 * each type it draws at most, on a sprite of that type's build, readable, no foe in the player's colours. A game
 * without the file draws as it ships and passes.
 */
export function checkGameSprites(gameDir: string): ValidationReport {
  const path = join(gameDir, 'content', 'sprites.json');
  if (!existsSync(path)) return report([], { designs: 0 });
  const sheet = SpriteSheet.safeParse(readJson(path));
  if (!sheet.success) return report(sheet.error.issues.map((i) => err('sprites_schema', `content/sprites.json ${i.path.join('.')}: ${i.message}`)));
  const style = StyleCard.safeParse(readJson(join(gameDir, 'design', 'style.json')));
  if (!style.success) return report([err('style_missing', "design/style.json is missing or invalid: sprites are judged in the game's palette")]);
  return checkSpriteSheet(sheet.data, { pal: artPalette(style.data.palette, style.data.outline), types: castOf(readGameFiles(gameDir)) });
}
