import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { generateArtifact, providerFor, type GenerateResult } from '@gg/llm';
import { FREEFORM_BASES, type CreateRequest, type FreeformBase, type EntityRoster, type FreeformGddFrontmatter, type FreeformSystemsJson, type LevelHints, type LevelJson, type Objectives, type ScopeTier } from '@gg/schemas';
import { sfxPresetFor } from '@gg/sdk/art';
import { grammarHasGoal, plannedLevelCount, rolesPresent, suggestHints, type GenreManifest } from '@gg/template-core';
import { ARCHETYPES, BASE_MANIFESTS, checkFreeformObjectives, compileRoster, compose, designContentFor, FREEFORM_CATALOG, freeformDesignManifest, hudKeysOf, IDENTITY_ROSTER, movementOf, proveLevel, RUNTIMES, SYSTEMS, usableSystems } from '@gg/template-freeform/node';
import { hasBespokeSystems, hasGameBots, readGameFiles, readGameInputs, readGameLevels } from '@gg/templates/node';
import { checkComposition, checkSystems, silentSfx } from '@gg/validators';
import { baseSystems, defaultObjectives, draftFreeformFrontmatter, exampleFor, guessBase } from '../freeform.js';
import { designContentOf, writeDesignContent } from './design-content.js';
import type { PairDraft, StageContext, StageOutcome } from './types.js';
import { add, ok, readGdd, readSystems, sumUsage, writeJson, ZERO } from './stage-kit.js';

/** Genres that move the way a base does: where the systems and entities a freeform game on it may use come from. */
const sameMovement = (base: FreeformBase) => FREEFORM_BASES.filter((g) => RUNTIMES[g].movementMode === RUNTIMES[base].movementMode);

/** Hostile entities a freeform game on a base can have (none of them bosses). */
const hostilesFor = (base: FreeformBase) => Object.values(ARCHETYPES).filter((a) => a.genre !== null && sameMovement(base).includes(a.genre) && a.roles.includes('hostile') && !a.def.boss);

/** The verbs games moving like a base offer: a freeform GDD's verbs come from these. */
const verbsFor = (base: FreeformBase) => [...new Set(sameMovement(base).flatMap((g) => BASE_MANIFESTS[g].gddDefaults.verbs))];

/** One line per base for the GDD prompt: what its levels and movement are, its budget, verbs and enemies. */
function baseLine(base: FreeformBase, tier: ScopeTier): string {
  const m = BASE_MANIFESTS[base];
  return `- ${base} (${m.name}): ${movementOf(base)} movement, ${m.levelGrammar.kind} levels; budget ${JSON.stringify(m.scopeBudget[tier])}; verbs ${verbsFor(base).join(', ')}; enemies to build on: ${hostilesFor(base).map((a) => a.id).join(', ')}.`;
}

/** What a freeform GDD must hold to: its base's budget and level plan, verbs and enemies moving like the base. */
export function verifyFreeformGdd(v: FreeformGddFrontmatter, tier: ScopeTier): string[] {
  const issues: string[] = [];
  if (v.genre !== 'freeform') issues.push("genre must be 'freeform'");
  const m = BASE_MANIFESTS[v.base];
  const budget = m.scopeBudget[tier];
  for (const k of ['levels', 'enemies', 'items', 'bosses'] as const) if (v.scope[k] > budget[k]) issues.push(`scope.${k} ${v.scope[k]} exceeds the ${v.base} tier budget ${budget[k]}`);
  const planned = plannedLevelCount(m.levelGrammar.kind, v.scope.levels);
  if (planned !== v.scope.levels) issues.push(`scope.levels ${v.scope.levels}: a game on ${v.base} builds ${planned}`);
  for (const i of silentSfx(v, sfxPresetFor)) issues.push(i.message);
  const hostiles = hostilesFor(v.base).length;
  if (v.scope.enemies > hostiles) issues.push(`scope.enemies exceeds the ${hostiles} enemy kinds a game on ${v.base} can have`);
  const verbs = verbsFor(v.base);
  if (!v.verbs.some((x) => verbs.includes(x))) issues.push(`verbs must include at least one of ${verbs.join(', ')}`);
  return issues;
}

/**
 * The front matter of a freeform idea (its request already sanitised): the model picks the base genre whose levels and
 * movement fit it, and the rest as for any game, inside that base's budget. Falls back to a draft on the base the idea's
 * words point at.
 */
export async function freeformFrontmatter(ctx: StageContext, req: CreateRequest, styleNotes: string[], system: string): Promise<{ fm: FreeformGddFrontmatter; g: GenreManifest; res: GenerateResult<FreeformGddFrontmatter>; prompt: string; note: string | null }> {
  const draft = draftFreeformFrontmatter(req, guessBase(req.prompt));
  const prompt = [
    `Concept:\n${req.prompt}`,
    styleNotes.length ? `Art direction (from the style card): ${styleNotes.join('; ')}.` : '',
    "This idea fits no single genre template. Build it on the base genre whose levels and movement fit it best; the systems stage then mixes in systems from any genre that moves the same way (another genre's weapon, a survival clock, collect-and-exit rules).",
    `Bases (tier '${req.scopeTier}'; the scope must not exceed the chosen base's budget):\n${FREEFORM_BASES.map((b) => baseLine(b, req.scopeTier)).join('\n')}`,
    `Starting point (choose the base; keep the shape; adapt title, pillars, scope and targets to the concept):\n${JSON.stringify(draft)}`,
  ].join('\n\n');
  const res = await generateArtifact<FreeformGddFrontmatter>({
    provider: providerFor(ctx.provider),
    model: ctx.model,
    artifact: 'FreeformGddFrontmatter',
    system,
    prompt,
    k: ctx.policy?.k ?? 1,
    repairRounds: ctx.policy?.repairRounds ?? 1,
    verify: (v) => verifyFreeformGdd(v, req.scopeTier),
    score: (v) => v.verbs.filter((x) => verbsFor(v.base).includes(x)).length + v.feedbackEvents.length * 0.1,
  });
  const fm = res.selected?.value ?? draft;
  const note = res.selected ? null : `front matter: ${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); using the drafted front matter on ${draft.base}`;
  return { fm, g: BASE_MANIFESTS[fm.base], res, prompt, note };
}

/** What a freeform systems.json must hold to: its base, usable systems, the catalog's ranges, the composition rules. */
export function verifyFreeformSystems(v: FreeformSystemsJson, gdd: FreeformGddFrontmatter): string[] {
  const issues: string[] = [];
  if (v.genre !== 'freeform') issues.push("genre must be 'freeform'");
  if (v.composition.base !== gdd.base) issues.push(`composition.base must be the GDD's base '${gdd.base}'`);
  const base = BASE_MANIFESTS[gdd.base];
  if (!base.feelPresets[v.feelPreset]) issues.push(`feelPreset must be one of ${Object.keys(base.feelPresets).join(', ')}`);
  const usable = new Set(usableSystems(gdd.base));
  for (const s of v.systems) if (SYSTEMS[s.id] && !usable.has(s.id)) issues.push(`${s.id} does not work with ${movementOf(gdd.base)} movement`);
  issues.push(...checkSystems(v, FREEFORM_CATALOG, gdd).issues.filter((i) => i.severity === 'error').map((i) => i.message));
  if (issues.length) return issues;
  const { runtime } = compose(v, IDENTITY_ROSTER);
  // The objectives' own file comes with the composition stage, right after this one.
  const content = [...Object.keys(base.extraContent?.({ seed: 1, difficulty: 0.3 }) ?? {}), ...(v.systems.some((s) => s.id === 'objectives') ? ['objectives'] : [])];
  issues.push(...checkComposition(Object.values(runtime.systems).map((m) => m.meta), { roles: rolesPresent(runtime), content, params: Object.fromEntries(v.systems.map((s) => [s.id, s.params])) }).issues.filter((i) => i.severity === 'error').map((i) => i.message));
  return issues;
}

const COMPOSE_RULES = [
  'Exactly one system moves the player, and exactly one decides the win (the objectives system can: reach the goal, survive, defeat, collect, a HUD value; every clause or any one).',
  'One rule decides what a death does when anything can hurt the player (respawn, end the run, or lives with the objectives).',
  "Every system's needs are met (the movement it works with, the entities and content it uses), and no key has two uses (aiming may share the arrows).",
].join(' ');

/** The systems of a freeform game: any genre's that work with its base's movement, held together by the composition rules. */
export async function freeformSystems(ctx: StageContext, gdd: FreeformGddFrontmatter, system: string): Promise<StageOutcome> {
  const t0 = Date.now();
  const m = freeformDesignManifest(gdd.base);
  const example = exampleFor(gdd.base, ctx.request?.prompt);
  const prompt = [
    `GDD front matter: ${JSON.stringify(gdd)}`,
    `Base genre: ${gdd.base} (${movementOf(gdd.base)} movement, ${m.levelGrammar.kind} levels). Feel presets: ${Object.keys(m.feelPresets).join(', ')} (default ${m.defaultFeel}). systems.json has genre 'freeform' and composition { base: '${gdd.base}' }.`,
    `Systems you can combine (from every genre that moves this way): ${JSON.stringify(Object.values(m.systems).map(({ meta: c }) => ({ id: c.id, summary: c.summary, params: Object.fromEntries(Object.entries(c.params).filter(([, p]) => !p.composed)), controls: c.controls ?? {}, provides: c.provides ?? {}, requires: c.requires ?? {}, feedbackFor: c.feedbackFor })))}`,
    `Rules: ${COMPOSE_RULES}`,
    example ? `Example of a freeform game on this base: ${JSON.stringify(example.systems)}` : '',
  ].join('\n\n');
  const res = await generateArtifact<FreeformSystemsJson>({
    provider: providerFor(ctx.provider),
    model: ctx.model,
    artifact: 'FreeformSystemsJson',
    system,
    prompt,
    k: ctx.policy?.k ?? 1,
    repairRounds: ctx.policy?.repairRounds ?? 1,
    verify: (v) => verifyFreeformSystems(v, gdd),
    score: (v) => 10 - checkSystems(v, FREEFORM_CATALOG, gdd).issues.filter((i) => i.severity === 'warning').length - v.systems.length * 0.01,
  });
  let value = res.selected?.value;
  const notes: string[] = [];
  if (!value) {
    value = baseSystems(gdd.base);
    notes.push(`${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); using the ${gdd.base} systems`);
  }
  writeJson(join(ctx.gameDir, 'design', 'systems.json'), value);
  const pairs: PairDraft[] = res.selected ? [{ artifact: 'FreeformSystemsJson', system, prompt, output: value }] : [];
  return { ok: true, summary: `wrote design/systems.json on ${gdd.base} (${value.systems.map((s) => s.id).join(', ')}; feel ${value.feelPreset})${notes.length ? `; ${notes.join('; ')}` : ''}`, usage: sumUsage(res), costUsd: res.totalCostUsd, durationMs: Date.now() - t0, turns: res.samples.length, artifactPath: join(ctx.gameDir, 'design', 'systems.json'), promptHash: res.selected?.promptHash, pairs };
}

const COMPOSITION_SYSTEM = [
  "You name a 2D game's entities and write its rules as data. Every entity is a shipped one (an archetype) under the game's own name: its body, behaviour and art stay, only the name and a bounded health scale change.",
  'Names are short lowercase ids. Rules are clauses the objectives system checks; dying must always cost something.',
].join('\n');

/**
 * The archetypes a freeform game on a base can name, with what each is: its role, health, behaviour, boss flag; those
 * of genres moving like the base, and the entities its selected blocks bring (a courier's cargo and stations).
 */
function archetypeLines(base: FreeformBase, systemIds: readonly string[]): string {
  return Object.values(ARCHETYPES)
    .filter((a) => (a.genre === null ? systemIds.includes(a.block!) : sameMovement(base).includes(a.genre)))
    .map((a) => `- ${a.id}: ${a.roles.join(', ') || 'prop'}; hp ${a.def.hp ?? 1}${a.def.fsm ? `; behaviour ${a.def.fsm}` : ''}${a.def.pickup ? '; pickup' : ''}${a.def.projectile ? '; projectile' : ''}${a.def.boss ? '; boss' : ''}${a.genre === base ? ' (placed by the base levels)' : a.genre === null ? ` (comes with the ${a.block} system, which places it on the levels)` : ''}`)
    .join('\n');
}

/**
 * The composition of a freeform game: its entity roster (content/entities.json), and its win and lose rules
 * (content/objectives.json) when the objectives system decides the win. Each falls back to a safe default: the base's
 * entities under their own names; holding out on lives in an arena, reaching the goal on lives elsewhere.
 */
export async function composition(ctx: StageContext): Promise<StageOutcome> {
  const t0 = Date.now();
  const sys = readSystems(ctx.gameDir);
  const gddInfo = readGdd(ctx.gameDir);
  if (!sys || sys.genre !== 'freeform' || !gddInfo || gddInfo.fm.genre !== 'freeform') return ok('not a freeform game: nothing to compose');
  const base = sys.composition.base;
  const gdd = gddInfo.fm;
  const ids = sys.systems.map((s) => s.id);
  const provider = providerFor(ctx.provider);
  const example = exampleFor(base, ctx.request?.prompt);
  const notes: string[] = [];
  const pairs: PairDraft[] = [];
  let usage = { ...ZERO };
  let cost = 0;
  let turns = 0;

  const rosterPrompt = [
    `Game: "${gdd.title}". Pillars: ${gdd.pillars.join(' / ')}. Verbs: ${gdd.verbs.join(', ')}. Scope: ${JSON.stringify(gdd.scope)}.`,
    `Base genre: ${base}. Systems: ${ids.join(', ')}.`,
    `Shipped entities you can name (each at most once; the ones you leave out keep their own names):\n${archetypeLines(base, ids)}`,
    'Write content/entities.json: version 1, a one-line designNotes, player { hp } only to change the player health, and types [{ type, archetype, hp }] with hp a health scale from 0.5 to 3.',
    example ? `Example of a freeform game on this base: ${JSON.stringify(example.roster)}` : '',
  ].join('\n\n');
  const rosterRes = await generateArtifact<EntityRoster>({
    provider,
    model: ctx.model,
    artifact: 'EntityRoster',
    system: COMPOSITION_SYSTEM,
    prompt: rosterPrompt,
    k: ctx.policy?.k ?? 1,
    repairRounds: ctx.policy?.repairRounds ?? 1,
    verify: (v) => compileRoster(base, v, ids).issues.filter((i) => i.severity === 'error').map((i) => i.message),
    score: (v) => v.types.length * 0.1 + Math.min(v.designNotes.length, 80) / 100,
  });
  usage = add(usage, sumUsage(rosterRes));
  cost += rosterRes.totalCostUsd;
  turns += rosterRes.samples.length;
  let roster = rosterRes.selected?.value;
  if (roster) pairs.push({ artifact: 'EntityRoster', system: COMPOSITION_SYSTEM, prompt: rosterPrompt, output: roster });
  else {
    roster = IDENTITY_ROSTER;
    notes.push(`roster: ${rosterRes.samples.length} samples rejected (${rosterRes.samples[0]?.issues?.[0] ?? 'provider error'}); the ${base} entities keep their names`);
  }
  writeJson(join(ctx.gameDir, 'content', 'entities.json'), roster);

  let objectives: Objectives | null = null;
  if (ids.includes('objectives')) {
    const compiled = compileRoster(base, roster, ids);
    const goal = grammarHasGoal(BASE_MANIFESTS[base].levelGrammar.kind);
    const objectivesPrompt = [
      `Game: "${gdd.title}". Pillars: ${gdd.pillars.join(' / ')}.`,
      `Base genre: ${base}; its levels ${goal ? 'have a goal tile to reach' : 'are one arena without a goal tile'}. Level time: ${Math.round(gdd.targets.levelTimeS)} s.`,
      `Entity types: ${compiled.defs.map((d) => `${d.type} (${compiled.roles[d.type]?.join(', ') || 'prop'})`).join('; ')}.`,
      `Numbers its systems keep on the HUD, which hud_at_least can count: ${[...hudKeysOf(compose(sys, roster).runtime), 'score'].join(', ')}.`,
      'Write content/objectives.json: win { mode all|any, clauses } from reach_goal, survive { seconds }, defeat { type?, count | all }, collect { type?, count }, hud_at_least { key, value }; lose from time_out { seconds } and lives { count }. A survive clause needs a lives rule.',
      example?.objectives ? `Example of a freeform game on this base: ${JSON.stringify(example.objectives)}` : '',
    ].join('\n\n');
    const res = await generateArtifact<Objectives>({
      provider,
      model: ctx.model,
      artifact: 'Objectives',
      system: COMPOSITION_SYSTEM,
      prompt: objectivesPrompt,
      k: ctx.policy?.k ?? 1,
      repairRounds: ctx.policy?.repairRounds ?? 1,
      verify: (v) => checkFreeformObjectives(sys, roster, v).issues.filter((i) => i.severity === 'error').map((i) => i.message),
      score: (v) => v.win.clauses.length * 0.1 + v.lose.length * 0.1,
    });
    usage = add(usage, sumUsage(res));
    cost += res.totalCostUsd;
    turns += res.samples.length;
    objectives = res.selected?.value ?? null;
    if (objectives) pairs.push({ artifact: 'Objectives', system: COMPOSITION_SYSTEM, prompt: objectivesPrompt, output: objectives });
    else {
      objectives = defaultObjectives(base, gdd.targets.levelTimeS);
      notes.push(`objectives: ${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); using ${goal ? 'reach the goal' : 'hold out'} on lives`);
    }
    writeJson(join(ctx.gameDir, 'content', 'objectives.json'), objectives);
  }

  // What the game's systems read and its idea decides (a farm's crops), named to go with its entities.
  const content = await writeDesignContent(ctx, designContentFor(ids), sys, { title: gdd.title, pillars: gdd.pillars, body: gddInfo.body, notes: `Its entities: ${roster.designNotes}`, examples: example?.content });
  usage = add(usage, content.usage);
  cost += content.costUsd;
  turns += content.turns;
  pairs.push(...content.pairs);
  notes.push(...content.notes);
  const named = roster.types.map((t) => `${t.type}<${t.archetype}`).join(', ') || 'base names';
  const written = content.written.length ? `, ${content.written.join(', ')}` : '';
  return { ok: true, summary: `wrote content/entities.json (${named})${objectives ? ` and content/objectives.json (${objectives.win.clauses.map((c) => c.kind).join(` ${objectives.win.mode} `)})` : ''}${written}${notes.length ? `; ${notes.join('; ')}` : ''}`, usage, costUsd: cost, durationMs: Date.now() - t0, turns, artifactPath: join(ctx.gameDir, 'content'), pairs };
}

/**
 * A freeform game's composition as its stage wrote it: the roster, the rules when the objectives system decides the win,
 * and the content its idea decides (a farm's crops).
 */
export function compositionOf(gameDir: string): { roster: EntityRoster; content: Record<string, unknown> } {
  const files = readGameFiles(gameDir);
  const objectives = readGameInputs(gameDir).content['objectives'];
  const designed = designContentOf(gameDir, designContentFor(files.systems?.systems.map((s) => s.id) ?? []));
  return { roster: files.roster ?? IDENTITY_ROSTER, content: { ...(objectives === undefined ? {} : { objectives }), ...designed } };
}

/**
 * Proves every level of a freeform game against the game as it now is: a stored proof that still wins is kept, else
 * the base genre's solver plays it under the base names, else the explorer. Writes content/proofs/ (and removes the
 * proofs of levels the game no longer has, and those that no longer win). A level no bot can win is left without one:
 * the game is still published and played, and is listed once a player records a winning run of it.
 */
export function reproveLevels(ctx: Pick<StageContext, 'gameDir'>, budget = 40_000): { ok: boolean; summary: string; unproven: string[]; stuck: Record<string, Stuck> } {
  const files = readGameFiles(ctx.gameDir);
  const sys = files.systems;
  if (sys?.genre !== 'freeform') return { ok: true, summary: 'curated: the genre solver proves the levels', unproven: [], stuck: {} };
  const proofsDir = join(ctx.gameDir, 'content', 'proofs');
  const hintsDir = join(ctx.gameDir, 'content', 'hints');
  const levels = readGameLevels(ctx.gameDir);
  // Runs and hints of levels the game no longer has go with them.
  const prune = () => {
    const ids = new Set(levels.map((l) => `${l.level.id}.json`));
    for (const dir of [proofsDir, hintsDir]) if (existsSync(dir)) for (const f of readdirSync(dir)) if (!ids.has(f)) rmSync(join(dir, f));
  };
  // A game with systems or bots of its own records its runs with its own code: its prover runs in the game's test runner.
  const waiting = (ids: string[]) => (ids.length ? `; waiting for a winning run: ${ids.join(', ')}` : '');
  if (hasBespokeSystems(ctx.gameDir) || hasGameBots(ctx.gameDir)) {
    const r = spawnSync('pnpm', ['run', 'prove'], { cwd: ctx.gameDir, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 16 * 1024 * 1024 });
    prune();
    if (r.status !== 0) return { ok: false, summary: `the game's prover did not run: ${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-12).join(' / ')}`, unproven: [], stuck: {} };
    const unproven = levels.map((l) => l.level.id).filter((id) => !existsSync(join(proofsDir, `${id}.json`)));
    for (const id of unproven) rmSync(join(hintsDir, `${id}.json`), { force: true });
    return { ok: true, summary: `proved ${levels.length - unproven.length} level(s) with the game's own systems (pnpm prove)${waiting(unproven)}`, unproven, stuck: {} };
  }
  const base = BASE_MANIFESTS[sys.composition.base];
  const inputs = { file: sys, roster: files.roster ?? IDENTITY_ROSTER, ...readGameInputs(ctx.gameDir), solver: base.bots[base.solverBot], budget };
  const done: string[] = [];
  const unproven: string[] = [];
  const stuck: Record<string, Stuck> = {};
  for (const { level, index } of levels) {
    const hints = files.hints.find((h) => h.level === level.id);
    const r = proveLevel(level, index, { ...inputs, ...(hints ? { hints } : {}) }, files.proofs.find((p) => p.level === level.id));
    const file = join(proofsDir, `${level.id}.json`);
    if (r.proof) {
      writeJson(file, r.proof);
      done.push(`${level.id} (${r.proof.by}${hints ? ' with hints' : ''}, ${Math.round(r.proof.ticks / 60)} s)`);
    } else {
      // A run that no longer wins is no evidence, nor are hints that no longer find one (the level was edited): the
      // level waits for a new run, and may be given new hints.
      rmSync(file, { force: true });
      if (hints) rmSync(join(hintsDir, `${level.id}.json`), { force: true });
      unproven.push(level.id);
      if (r.stuck) stuck[level.id] = r.stuck;
    }
  }
  prune();
  return { ok: true, summary: `proved ${done.length} level(s): ${done.join(', ')}${waiting(unproven)}`, unproven, stuck };
}

/** Where the explorer got stuck on a level: how far it got by the game's own account, the HUD, where the player stood. */
export type Stuck = NonNullable<ReturnType<typeof proveLevel>['stuck']>;

const HINTS_SYSTEM = [
  'A search plays a game level to prove it can be finished, and could not finish this one alone. You write the way, as data (LevelHints): its steps in the order a player takes them.',
  "A step is a place to reach (a tile x, y; done once the player is within r tiles of it by walking, never through a wall) or a HUD number to get to a value (the score counts as one, as 'score').",
  'Put places on the way the player must go: open tiles, a few to a dozen tiles apart, each one where the way turns or opens (a gap, a ledge, a door, the key before the door). Never a tile inside a wall.',
  'Use the fewest steps that make the way plain, at most twelve. When the win is reaching the goal, the goal is the last step.',
].join('\n');

/** What is wrong with hints for a level: places off the level or inside its walls, HUD numbers the game does not keep. */
export function hintIssues(hints: LevelHints, level: LevelJson, hud: readonly string[]): string[] {
  const issues: string[] = [];
  if (hints.level !== level.id) issues.push(`level must be '${level.id}'`);
  hints.steps.forEach((s, i) => {
    if (s.kind === 'reach') {
      if (s.x >= level.width || s.y >= level.height) issues.push(`step ${i + 1}: (${s.x}, ${s.y}) is off the ${level.width} x ${level.height} level`);
      else if (level.legend[level.rows[s.y]![s.x]!] === 'solid') issues.push(`step ${i + 1}: (${s.x}, ${s.y}) is inside a wall`);
    } else if (s.key !== 'score' && !hud.includes(s.key)) issues.push(`step ${i + 1}: the game keeps no HUD number '${s.key}' (it keeps ${hud.length ? hud.join(', ') : 'none'}, and the score)`);
  });
  return issues;
}

/** A level's hints on file while they still fit it: an edit can wall a step in or cut the level short. */
export function hintsFor(gameDir: string, level: LevelJson): LevelHints | undefined {
  const hints = readGameFiles(gameDir).hints.find((h) => h.level === level.id);
  // Only the places can stop fitting: the HUD numbers were checked when the hints were written.
  const counted = hints?.steps.flatMap((s) => (s.kind === 'hud_at_least' ? [s.key] : [])) ?? [];
  return hints && hintIssues(hints, level, counted).length === 0 ? hints : undefined;
}

/**
 * The levels of a freeform game nothing could win, given hints and proven again: the model writes the way for each
 * (at most three, from the level, the win and where the search got stuck, with the floor's own walk as a start) and
 * hints that win their level are kept with it (content/hints/). Hints that do not are dropped: a hint file is only
 * ever beside the run it found.
 */
export async function hintLevels(ctx: StageContext, unproven: readonly string[], stuck: Readonly<Record<string, Stuck>>): Promise<{ summary: string; unproven: string[]; usage: ReturnType<typeof sumUsage>; costUsd: number; turns: number; pairs: PairDraft[] }> {
  const files = readGameFiles(ctx.gameDir);
  const sys = files.systems;
  let usage = { ...ZERO };
  let costUsd = 0;
  let turns = 0;
  const pairs: PairDraft[] = [];
  const none = { summary: '', unproven: [...unproven], usage, costUsd, turns, pairs };
  if (sys?.genre !== 'freeform' || unproven.length === 0) return none;
  const levels = readGameLevels(ctx.gameDir);
  const game = compose(sys, files.roster ?? IDENTITY_ROSTER);
  const hud = hudKeysOf(game.runtime);
  const feel = game.runtime.feelPresets[sys.feelPreset] ?? Object.values(game.runtime.feelPresets)[0]!;
  const objectives = readGameInputs(ctx.gameDir).content['objectives'];
  const hintsDir = join(ctx.gameDir, 'content', 'hints');
  const asked: string[] = [];
  for (const id of unproven.slice(0, 3)) {
    const level = levels.find((l) => l.level.id === id)?.level;
    if (!level) continue;
    const start = suggestHints(level, { movementMode: game.runtime.movementMode, feel });
    const where = stuck[id];
    const prompt = [
      `Level ${id} (${level.width} x ${level.height} tiles, ${game.runtime.movementMode === 'topdown' ? 'seen from above' : 'side view, with gravity'}). Legend: ${Object.entries(level.legend).map(([ch, kind]) => `'${ch}' ${kind}`).join(', ')}. The spawn is at (${level.spawn.x}, ${level.spawn.y}) and the goal at (${level.goal.x}, ${level.goal.y}).`,
      level.rows.map((r, y) => `${String(y).padStart(3)} ${r}`).join('\n'),
      level.entities.length ? `Entities: ${level.entities.map((e) => `${e.type} at (${e.x}, ${e.y})`).join('; ')}.` : 'No entities.',
      `The win and the loss: ${JSON.stringify(objectives ?? 'reach the goal')}. HUD numbers the game keeps: ${hud.length ? hud.join(', ') : 'none'} (and the score).`,
      where ? `Where the search got stuck: progress ${where.progress.toFixed(2)} by the game's own account, the player at (${where.at.x}, ${where.at.y}), the HUD ${JSON.stringify(where.hud)}.` : '',
      start ? `The floor's own walk from the spawn to the goal, as steps (keep, cut or replace them):\n${JSON.stringify(start)}` : '',
    ].join('\n\n');
    const res = await generateArtifact<LevelHints>({
      provider: providerFor(ctx.provider),
      model: ctx.model,
      artifact: 'LevelHints',
      system: HINTS_SYSTEM,
      prompt,
      k: ctx.policy?.k ?? 1,
      repairRounds: ctx.policy?.repairRounds ?? 1,
      verify: (v) => hintIssues(v, level, hud),
      score: (v) => 1 - v.steps.length / 100,
    });
    usage = add(usage, sumUsage(res));
    costUsd += res.totalCostUsd;
    turns += res.samples.length;
    const hints = res.selected?.value;
    if (!hints) continue;
    writeJson(join(hintsDir, `${id}.json`), hints);
    pairs.push({ artifact: 'LevelHints', system: HINTS_SYSTEM, prompt, output: hints });
    asked.push(id);
  }
  if (asked.length === 0) return { ...none, usage, costUsd, turns };
  const proven = reproveLevels(ctx);
  // Hints that did not find the win are no help to anyone: only those beside a run are kept.
  for (const id of asked) if (proven.unproven.includes(id)) rmSync(join(hintsDir, `${id}.json`), { force: true });
  const helped = asked.filter((id) => !proven.unproven.includes(id));
  const summary = `hints for ${asked.join(', ')}: ${helped.length ? `won ${helped.join(', ')}` : 'no win'}`;
  return { summary, unproven: proven.unproven, usage, costUsd, turns, pairs: pairs.filter((p) => helped.some((id) => (p.output as LevelHints).level === id)) };
}
