import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockedTermsFor, resolveReferences, sanitize, styleFromReferences } from '@gg/catalog';
import { costUsd, generateArtifact, providerFor, type GenerateResult, type Usage } from '@gg/llm';
import { BundleManifest, LevelJson, StyleCard, type AnyGddFrontmatter, type BehaviourFsm, type CreateRequest, type GddFrontmatter, type LevelProof, type SystemsJson } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed } from '@gg/sdk';
import { DEFAULT_STYLE, defaultSystems, scaffold } from '@gg/scaffold';
import { checkLevel, levelPlan, levelTicksOf, plannedLevelCount, runBot, simOptionsFor, type GenreManifest, type LevelGenParams } from '@gg/template-core';
import { BASE_MANIFESTS, IDENTITY_ROSTER, proveLevel } from '@gg/template-freeform/node';
import { CATALOG, catalogFor, genre as genreOf, readGameInputs, resolveGame } from '@gg/templates/node';
import { sfxPresetFor } from '@gg/sdk/art';
import { checkGdd, checkSystems, impact, silentSfx, validateBehaviour, type ValidationReport } from '@gg/validators';
import { draftBody, draftFrontmatter, renderGdd, slugify } from '../gdd-draft.js';
import { composition, compositionOf, freeformFrontmatter, freeformSystems, reproveLevels } from './freeform-stages.js';
import type { PairDraft, Runner, StageContext, StageOutcome } from './types.js';
import { add, fail, listJson, ok, readGdd, readJson, readSystems, sumUsage, writeJson, ZERO, type StageFn } from './stage-kit.js';

/** The game of the job: its curated genre, or its freeform composition; from its design files, else the create request. */
export function genreOfGame(ctx: Pick<StageContext, 'request' | 'gameDir'>): GenreManifest {
  return resolveGame(ctx.gameDir, ctx.request?.genre);
}

// ---------------------------------------------------------------- gdd

const GDD_SYSTEM = [
  'You are the lead designer of a small 2D browser game built on a fixed runtime with catalog systems.',
  'Designs are concrete and small: exactly three pillars (one idea each), scope inside the tier budget, numeric targets,',
  'player verbs as single lowercase words, and a feedback-events table using only the fixed event and channel names.',
  'Never invent engine features; everything must be expressible as levels, enemy behaviour data and system parameters.',
].join('\n');

/** A game's front matter as the gdd stage settles it: the value, the manifest the game builds on, the call that wrote it. */
interface FrontMatter<T extends AnyGddFrontmatter> {
  fm: T;
  g: GenreManifest;
  res: GenerateResult<T>;
  prompt: string;
  /** Why the draft stands in for the model's front matter, when it does. */
  note: string | null;
}

/**
 * The front matter of a game in a curated genre (its request already sanitised): inside the genre's budget, with its
 * verbs and enemies. Falls back to the genre's draft.
 */
async function curatedFrontmatter(ctx: StageContext, req: CreateRequest, styleNotes: string[], g: GenreManifest): Promise<FrontMatter<GddFrontmatter>> {
  const budget = g.scopeBudget[req.scopeTier];
  const draft = draftFrontmatter(req, g);
  const prompt = [
    `Concept:\n${req.prompt}`,
    styleNotes.length ? `Art direction (from the style card): ${styleNotes.join('; ')}.` : '',
    `Genre: ${g.name} (${g.id}). Scope tier '${req.scopeTier}' budget: ${JSON.stringify(budget)} (scope must not exceed it).`,
    `Verbs available in this genre: ${g.gddDefaults.verbs.join(', ')}. Enemy types: ${g.entityDefs.filter((e) => e.fsm).map((e) => e.type).join(', ')}. Items: ${g.collectibleTypes.join(', ')}.`,
    `Genre guidance:\n${g.gddFragment}`,
    `Starting point (keep the shape; adapt title, pillars, scope and targets to the concept):\n${JSON.stringify(draft)}`,
  ].join('\n\n');
  const res = await generateArtifact<GddFrontmatter>({
    provider: providerFor(ctx.provider),
    model: ctx.model,
    artifact: 'GddFrontmatter',
    system: GDD_SYSTEM,
    prompt,
    k: ctx.policy?.k ?? 1,
    repairRounds: ctx.policy?.repairRounds ?? 1,
    verify: (v) => {
      const issues: string[] = [];
      if (v.genre !== g.id) issues.push(`genre must be '${g.id}'`);
      for (const k of ['levels', 'enemies', 'items', 'bosses'] as const) if (v.scope[k] > budget[k]) issues.push(`scope.${k} ${v.scope[k]} exceeds the tier budget ${budget[k]}`);
      if (plannedLevelCount(g.levelGrammar.kind, v.scope.levels) !== v.scope.levels) issues.push(`scope.levels ${v.scope.levels}: this genre builds ${plannedLevelCount(g.levelGrammar.kind, v.scope.levels)}`);
      for (const i of silentSfx(v, sfxPresetFor)) issues.push(i.message);
      if (v.scope.enemies > g.entityDefs.filter((e) => e.fsm).length) issues.push(`scope.enemies exceeds the ${g.entityDefs.filter((e) => e.fsm).length} enemy types this genre has`);
      const known = new Set(g.gddDefaults.verbs);
      if (!v.verbs.some((x) => known.has(x))) issues.push(`verbs must include at least one of ${g.gddDefaults.verbs.join(', ')}`);
      return issues;
    },
    score: (v) => v.verbs.filter((x) => g.gddDefaults.verbs.includes(x)).length + v.feedbackEvents.length * 0.1,
  });
  const note = res.selected ? null : `front matter: ${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); using the drafted front matter`;
  return { fm: res.selected?.value ?? draft, g, res, prompt, note };
}

const gdd: StageFn = async (ctx) => {
  const t0 = Date.now();
  const req = ctx.request;
  if (!req) return fail('gdd stage needs a create request', 'spec_violation');
  const design = join(ctx.gameDir, 'design');
  mkdirSync(design, { recursive: true });
  // Style references resolve to cards of unprotectable attributes; the titles and their blocked terms never
  // reach a prompt or a public artifact (concept.md is private and stays out of the bundle).
  const refs = resolveReferences(req.referenceTitles);
  const blocked = blockedTermsFor(refs.matched);
  const clean = sanitize(req.prompt.trim(), blocked);
  const cleanReq = { ...req, prompt: clean.text };
  if (!existsSync(join(design, 'style.json'))) {
    const base = { ...DEFAULT_STYLE, name: 'style' };
    writeJson(join(design, 'style.json'), refs.matched.length ? styleFromReferences(refs.matched, base, 'reference-style') : base);
  }
  const styleNotes = refs.matched.flatMap((e) => e.card.notes).slice(0, 8);
  const provider = providerFor(ctx.provider);
  const notes: string[] = [];
  if (clean.hits.length) notes.push(`prompt sanitised (${clean.hits.length} reference term(s) removed)`);

  // A freeform idea's front matter also picks the curated genre it builds on, whose manifest the rest of the stage uses.
  const front: FrontMatter<AnyGddFrontmatter> = req.genre === 'freeform' ? await freeformFrontmatter(ctx, cleanReq, styleNotes, GDD_SYSTEM) : await curatedFrontmatter(ctx, cleanReq, styleNotes, genreOf(req.genre));
  const g = front.g;
  const budget = g.scopeBudget[req.scopeTier];
  let usage = sumUsage(front.res);
  let cost = front.res.totalCostUsd;
  let turns = front.res.samples.length;
  if (front.note) notes.push(front.note);
  let fm: AnyGddFrontmatter = front.fm;
  const fmWritten = front.res.selected?.value !== undefined;
  writeFileSync(
    join(design, 'concept.md'),
    `# Concept\n\n${req.prompt.trim()}\n\n- Genre: ${fm.genre === 'freeform' ? `freeform, built on ${g.name}` : g.name}\n- Scope tier: ${req.scopeTier}\n${refs.matched.length ? `- Style references (private): ${refs.matched.map((e) => e.title).join(', ')}\n` : ''}${refs.unmatched.length ? `- Unresolved references: ${refs.unmatched.join(', ')}\n` : ''}`,
  );

  const bodyPrompt = [
    `Write the GDD body (markdown, no front matter) for "${fm.title}", a ${fm.genre === 'freeform' ? `game built on the ${g.name.toLowerCase()} template with systems from other genres` : g.name.toLowerCase()}.`,
    'Required sections, in order, each as a level-2 heading: ## Concept, ## Pillars, ## Core loop (30 seconds / 5 minutes / session), ## Progression, ## Scope, ## Feedback.',
    'Under 600 words. Concrete sentences; counts must match the front matter.',
    `Front matter: ${JSON.stringify(fm)}`,
    `Concept: ${clean.text}`,
    styleNotes.length ? `Art direction: ${styleNotes.join('; ')}.` : '',
  ].join('\n');
  let body: string | null = null;
  let repair = '';
  for (let round = 0; round < 2 && !body; round++) {
    try {
      const r = await provider.text({ model: ctx.model, system: GDD_SYSTEM, prompt: `${bodyPrompt}${repair}`, maxTokens: 2048 });
      usage = add(usage, r.usage);
      cost += costUsd(ctx.model, r.usage);
      turns++;
      const candidate = sanitize(r.text.replace(/^---[\s\S]*?---\s*/m, '').trim(), blocked).text;
      const check = checkGdd(renderGdd(fm, candidate), budget);
      if (check.ok) body = candidate;
      else repair = `\n\nYour previous body was rejected: ${check.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}. Write it again with every required section.`;
    } catch (e) {
      notes.push(`body: ${(e as Error).message}`);
      break;
    }
  }
  const bodyWritten = body !== null;
  if (!body) {
    body = draftBody(cleanReq, g, fm);
    notes.push('body: drafted deterministically');
  }
  fm = { ...fm, title: sanitize(fm.title, blocked).text.slice(0, 80) || fm.title };
  writeFileSync(join(design, 'gdd.md'), renderGdd(fm, body));
  const pairs: PairDraft[] = [];
  if (fmWritten) pairs.push({ artifact: fm.genre === 'freeform' ? 'FreeformGddFrontmatter' : 'GddFrontmatter', system: GDD_SYSTEM, prompt: front.prompt, output: fm });
  if (bodyWritten) pairs.push({ artifact: 'GddBody', system: GDD_SYSTEM, prompt: bodyPrompt, output: body });
  const stylePath = join(design, 'style.json');
  const style = StyleCard.parse(readJson(stylePath));
  if (style.name === 'style' || style.name === 'reference-style') writeJson(stylePath, { ...style, name: `${slugify(fm.title)}-style` });
  return {
    ok: true,
    summary: `wrote design/gdd.md: "${fm.title}", ${fm.scope.levels} level(s), ${fm.scope.enemies} enemy type(s)${notes.length ? `; ${notes.join('; ')}` : ''}`,
    usage,
    costUsd: cost,
    durationMs: Date.now() - t0,
    turns,
    artifactPath: join(design, 'gdd.md'),
    promptHash: front.res.selected?.promptHash,
    pairs,
  };
};

// ---------------------------------------------------------------- systems

const SYSTEMS_SYSTEM = [
  'You select catalog systems for a 2D browser game. Output systems.json: version 1, the genre, one feel preset, and the selected systems with parameters.',
  'Include every required system. Add optional systems only when the design needs them. Parameters stay inside the catalog ranges; omit a parameter to take its default.',
  'Every GDD feedback event must be bindable by a selected system.',
].join('\n');

const systems: StageFn = async (ctx) => {
  const t0 = Date.now();
  const gddInfo = readGdd(ctx.gameDir);
  if (!gddInfo) return fail('design/gdd.md missing or invalid', 'spec_violation');
  if (gddInfo.fm.genre === 'freeform') return freeformSystems(ctx, gddInfo.fm, SYSTEMS_SYSTEM);
  const g = genreOfGame(ctx);
  const catalog = Object.values(CATALOG).filter((c) => c.genres === '*' || c.genres.includes(g.id));
  const exemplar = g.exemplars.find((e) => e.kind === 'systems')?.artifact;
  const prompt = [
    `GDD front matter: ${JSON.stringify(gddInfo.fm)}`,
    `Genre '${g.id}'. Required systems: ${g.requiredSystems.join(', ')}. Optional: ${g.optionalSystems.join(', ')}. Feel presets: ${Object.keys(g.feelPresets).join(', ')} (default ${g.defaultFeel}).`,
    `Catalog: ${JSON.stringify(catalog.map((c) => ({ id: c.id, summary: c.summary, params: Object.fromEntries(Object.entries(c.params).filter(([, p]) => !p.composed)), feedbackFor: c.feedbackFor })))}`,
    exemplar ? `Example for a similar game: ${JSON.stringify(exemplar)}` : '',
  ].join('\n\n');
  const res = await generateArtifact<SystemsJson>({
    provider: providerFor(ctx.provider),
    model: ctx.model,
    artifact: 'SystemsJson',
    system: SYSTEMS_SYSTEM,
    prompt,
    k: ctx.policy?.k ?? 1,
    repairRounds: ctx.policy?.repairRounds ?? 1,
    verify: (v) => {
      const issues: string[] = [];
      if (v.genre !== g.id) issues.push(`genre must be '${g.id}'`);
      if (!g.feelPresets[v.feelPreset]) issues.push(`feelPreset must be one of ${Object.keys(g.feelPresets).join(', ')}`);
      issues.push(...checkSystems(v, CATALOG, gddInfo.fm).issues.filter((i) => i.severity === 'error').map((i) => i.message));
      return issues;
    },
    score: (v) => 10 - checkSystems(v, CATALOG, gddInfo.fm).issues.filter((i) => i.severity === 'warning').length - v.systems.length * 0.01,
  });
  let value = res.selected?.value;
  const notes: string[] = [];
  if (!value) {
    value = defaultSystems(g.id, g.optionalSystems);
    notes.push(`${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); using the genre defaults`);
  }
  writeJson(join(ctx.gameDir, 'design', 'systems.json'), value);
  const pairs: PairDraft[] = res.selected ? [{ artifact: 'SystemsJson', system: SYSTEMS_SYSTEM, prompt, output: value }] : [];
  return { ok: true, summary: `wrote design/systems.json (${value.systems.map((s) => s.id).join(', ')}; feel ${value.feelPreset})${notes.length ? `; ${notes.join('; ')}` : ''}`, usage: sumUsage(res), costUsd: res.totalCostUsd, durationMs: Date.now() - t0, turns: res.samples.length, artifactPath: join(ctx.gameDir, 'design', 'systems.json'), promptHash: res.selected?.promptHash, pairs };
};

// ---------------------------------------------------------------- scaffold

const scaffoldStage: StageFn = async (ctx) => {
  const t0 = Date.now();
  const gddInfo = readGdd(ctx.gameDir);
  const sys = readSystems(ctx.gameDir);
  const stylePath = join(ctx.gameDir, 'design', 'style.json');
  if (!gddInfo || !sys) return fail('scaffold needs design/gdd.md and design/systems.json', 'spec_violation');
  const style = existsSync(stylePath) ? StyleCard.parse(readJson(stylePath)) : DEFAULT_STYLE;
  const result = scaffold({
    outDir: ctx.gameDir,
    genre: gddInfo.fm.genre,
    gameId: ctx.gameId,
    title: gddInfo.fm.title,
    systems: sys,
    style,
    gddMarkdown: gddInfo.md,
    levels: gddInfo.fm.scope.levels,
    seed: ctx.request?.seed ?? 1,
    ...(sys.genre === 'freeform' ? compositionOf(ctx.gameDir) : {}),
  });
  return ok(`scaffolded ${result.files.length} files; placeholder levels ${result.levels.join(', ')}`, { durationMs: Date.now() - t0, artifactPath: ctx.gameDir });
};

/** Re-proves a freeform game's levels after a change to how it plays (worker stage 'prove'; a no-op for curated games). */
const prove: StageFn = async (ctx) => {
  const t0 = Date.now();
  const r = reproveLevels(ctx);
  return r.ok ? ok(r.summary, { durationMs: Date.now() - t0 }) : fail(r.summary, 'semantic_invalid', { durationMs: Date.now() - t0 });
};

// ---------------------------------------------------------------- behaviour

const BEHAVIOUR_SYSTEM = [
  'You author enemy behaviour as data: a BehaviourFsm with two to five states, a one-line designNotes first, and transitions that use only the genre vocabulary.',
  'Every state must be reachable and (unless terminal by design) have a way out. Keep the id you are given. Prefer readable, fair behaviour over complexity.',
].join('\n');

const behaviour: StageFn = async (ctx) => {
  const t0 = Date.now();
  const g = genreOfGame(ctx);
  const gddInfo = readGdd(ctx.gameDir);
  if (!gddInfo) return fail('design/gdd.md missing or invalid', 'spec_violation');
  const allIds = [...new Set(g.entityDefs.filter((e) => e.fsm).map((e) => e.fsm as string))];
  const targeted = ctx.route?.targets.filter((t) => allIds.includes(t)) ?? [];
  const ids = targeted.length ? targeted : allIds.slice(0, Math.max(1, gddInfo.fm.scope.enemies));
  const provider = providerFor(ctx.provider);
  let usage: Usage = { ...ZERO };
  let cost = 0;
  let turns = 0;
  const notes: string[] = [];
  let promptHash: string | undefined;
  const pairs: PairDraft[] = [];
  for (const id of ids) {
    const entities = g.entityDefs.filter((e) => e.fsm === id);
    const exemplar = g.defaultBehaviours.find((b) => b.id === id) ?? (g.exemplars.find((e) => e.kind === 'behaviour')?.artifact as BehaviourFsm | undefined);
    const prompt = [
      `Behaviour id: ${id}`,
      `Entity types using it: ${entities.map((e) => `${e.type} (hp ${e.hp ?? 1}, contact damage ${e.contactDamage ?? 0}, ${e.gravity ? 'gravity' : 'free-moving'})`).join('; ')}`,
      `Game: "${gddInfo.fm.title}". Pillars: ${gddInfo.fm.pillars.join(' / ')}. Player verbs: ${gddInfo.fm.verbs.join(', ')}.${ctx.route ? ` Edit request: ${ctx.route.designNotes}` : ''}`,
      `Vocabulary: conditions ${g.behaviourVocab.conditions.join(', ')}; actions ${g.behaviourVocab.actions.join(', ')}.`,
      exemplar ? `Reference FSM for this id (adapt it to the game; keep the id):\n${JSON.stringify(exemplar)}` : '',
    ].join('\n\n');
    const res = await generateArtifact<BehaviourFsm>({
      provider,
      model: ctx.model,
      artifact: 'BehaviourFsm',
      system: BEHAVIOUR_SYSTEM,
      prompt,
      k: ctx.policy?.k ?? 1,
      repairRounds: ctx.policy?.repairRounds ?? 1,
      verify: (v) => {
        const issues: string[] = [];
        if (v.id !== id) issues.push(`id must be '${id}'`);
        issues.push(...validateBehaviour(v, g.behaviourVocab, g.entityDefs.map((e) => e.type)).issues.filter((i) => i.severity === 'error').map((i) => i.message));
        return issues;
      },
      score: (v) => {
        const n = Object.keys(v.states).length;
        return (n >= 2 && n <= 5 ? 1 : 0) + Math.min(v.designNotes.length, 80) / 100;
      },
    });
    usage = add(usage, sumUsage(res));
    cost += res.totalCostUsd;
    turns += res.samples.length;
    promptHash ??= res.selected?.promptHash;
    let value = res.selected?.value;
    if (!value) {
      if (!exemplar) return fail(`no behaviour accepted for '${id}' and no exemplar to fall back on`, 'semantic_invalid', { usage, costUsd: cost, turns, durationMs: Date.now() - t0 });
      value = exemplar;
      notes.push(`${id}: ${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); using the reference FSM`);
    } else {
      pairs.push({ artifact: 'BehaviourFsm', system: BEHAVIOUR_SYSTEM, prompt, output: value });
    }
    writeJson(join(ctx.gameDir, 'content', 'behaviour', `${id}.fsm.json`), value);
  }
  // A freeform game's levels are proven by recorded runs, which new behaviours can break: prove them again.
  const proven = reproveLevels(ctx);
  if (!proven.ok) return fail(`behaviours written, but ${proven.summary}`, 'semantic_invalid', { usage, costUsd: cost, turns, durationMs: Date.now() - t0 });
  if (g.id === 'freeform') notes.push(proven.summary);
  return { ok: true, summary: `wrote ${ids.length} behaviour(s): ${ids.join(', ')}${notes.length ? `; ${notes.join('; ')}` : ''}`, usage, costUsd: cost, durationMs: Date.now() - t0, turns, artifactPath: join(ctx.gameDir, 'content', 'behaviour'), promptHash, pairs };
};

// ---------------------------------------------------------------- levels

/**
 * Model-free: sample seeds from the genre generator, keep the candidates that pass the static validator and the
 * solver bot (with this game's systems, behaviours and content, at the seed the level is played with), select the one
 * whose solver time is closest to the GDD target. This is the data-tier sample -> verify -> select loop with the
 * generator as the sampler. The shared level plan sets the count, the ramp and the boss floor.
 */
const levels: StageFn = async (ctx) => {
  const t0 = Date.now();
  const g = genreOfGame(ctx);
  const gddInfo = readGdd(ctx.gameDir);
  const sys = readSystems(ctx.gameDir);
  if (!gddInfo || !sys) return fail('levels stage needs design/gdd.md and design/systems.json', 'spec_violation');
  const fm = gddInfo.fm;
  const feel = g.feelPresets[sys.feelPreset] ?? g.feelPresets[g.defaultFeel]!;
  const solver = g.bots[g.solverBot];
  if (!solver) return fail(`genre has no solver bot '${g.solverBot}'`, 'spec_violation');
  // The game's own inputs, its rules included: a level is proven against the game as it plays.
  const { behaviours, rules, content: gameContent, feedback } = readGameInputs(ctx.gameDir);
  const levelsDir = join(ctx.gameDir, 'content', 'levels');
  const kSeeds = Math.min(16, Math.max(4, ctx.policy?.k ?? 8));
  const baseSeed = (ctx.request?.seed ?? 1) * 1000 + (ctx.attempt - 1) * 100;
  const targetTicks = Math.round(fm.targets.levelTimeS * 60 * 0.6);

  // A freeform game's candidates get a winning run instead of a solver bot: its base genre's solver under the base names,
  // else a short explorer search. The chosen level ships with its run (content/proofs/).
  const freeform = sys.genre === 'freeform' ? sys : null;
  const roster = freeform ? compositionOf(ctx.gameDir).roster : IDENTITY_ROSTER;
  const baseSolver = freeform ? BASE_MANIFESTS[freeform.composition.base].bots[BASE_MANIFESTS[freeform.composition.base].solverBot] : undefined;
  const oracle = (level: LevelJson, content: Record<string, unknown>, playSeed: number, index: number): { ok: boolean; ticks: number; proof?: LevelProof } => {
    if (!g.levelGrammar.validate(level, feel).ok) return { ok: false, ticks: 0 };
    if (freeform) {
      const r = proveLevel(level, index, { file: freeform, roster, behaviours, rules, content, feedback, solver: baseSolver, budget: 20_000 });
      return r.proof ? { ok: true, ticks: r.proof.ticks, proof: r.proof } : { ok: false, ticks: 0 };
    }
    const so = simOptionsFor(g, sys, { behaviours, rules, content, feedback });
    const r = runBot(createSim({ ...so, level, seed: playSeed }), solver, levelTicksOf(so));
    return { ok: r.completed, ticks: r.ticks };
  };
  const proofsDir = join(ctx.gameDir, 'content', 'proofs');
  const plan = levelPlan(g.levelGrammar.kind, { levels: fm.scope.levels, bosses: fm.scope.bosses, tier: fm.scopeTier });

  const written: string[] = [];
  const tried: string[] = [];
  if (g.levelGrammar.kind === 'arena') {
    const slot = plan[0]!;
    const difficulty = slot.difficulty;
    let best: { level: LevelJson; content: Record<string, unknown>; dist: number; proof?: LevelProof } | null = null;
    for (let s = baseSeed; s < baseSeed + kSeeds * 2 && !best; s++) {
      const params: LevelGenParams = { seed: s, difficulty };
      const level: LevelJson = { ...g.levelGrammar.generate(params), id: 'arena', name: 'Arena', ramp: { segment: 0, difficulty } };
      const content = g.extraContent?.(params) ?? {};
      // The game's other content (a freeform game's objectives) plays along with the arena's own waves.
      const r = oracle(level, { ...gameContent, ...content }, slot.seed, slot.index);
      tried.push(`${s}:${r.ok ? 'ok' : 'x'}`);
      if (r.ok) best = { level, content, dist: 0, proof: r.proof };
    }
    if (!best) return fail(`no arena seed from ${baseSeed} passed the solver at difficulty ${difficulty} (${tried.join(' ')})`, 'semantic_invalid', { durationMs: Date.now() - t0 });
    rmSync(levelsDir, { recursive: true, force: true });
    writeJson(join(levelsDir, 'L01-arena.json'), best.level);
    for (const [key, value] of Object.entries(best.content)) writeJson(join(ctx.gameDir, 'content', `${key}.json`), value);
    if (best.proof) {
      rmSync(proofsDir, { recursive: true, force: true });
      writeJson(join(proofsDir, `${best.level.id}.json`), best.proof);
    }
    written.push('arena');
  } else {
    const targets = new Set((ctx.route?.targets ?? []).filter((t) => /^l\d{2}$/.test(t)));
    const existing = new Map(listJson(levelsDir).map((f) => [readJson<LevelJson>(f).id, f]));
    const out: Array<{ file: string; level: LevelJson; proof?: LevelProof }> = [];
    for (const { index: i, id, difficulty, boss, seed: playSeed } of plan) {
      if (targets.size && !targets.has(id) && existing.has(id)) {
        out.push({ file: `L${String(i + 1).padStart(2, '0')}-${id}.json`, level: readJson<LevelJson>(existing.get(id)!) });
        continue;
      }
      let best: { level: LevelJson; dist: number; solved: boolean; proof?: LevelProof } | null = null;
      for (let round = 0; round < 4 && !best; round++) {
        const from = baseSeed + i * 50 + round * kSeeds;
        for (let s = from; s < from + kSeeds; s++) {
          const level: LevelJson = { ...g.levelGrammar.generate({ seed: s, difficulty, boss }), id, name: `Level ${i + 1}`, ramp: { segment: i, difficulty } };
          const r = oracle(level, gameContent, playSeed, i);
          tried.push(`${id}@${s}:${r.ok ? r.ticks : 'x'}`);
          if (!r.ok) continue;
          const dist = Math.abs(r.ticks - targetTicks);
          // A level the base genre's solver finishes beats one only the explorer won: it is won the way the base's are.
          const solved = r.proof?.by !== 'explorer';
          if (!best || (solved !== best.solved ? solved : dist < best.dist)) best = { level, dist, solved, proof: r.proof };
        }
      }
      if (!best) return fail(`no seed produced a solvable level for ${id} at difficulty ${difficulty} (tried ${tried.filter((x) => x.startsWith(id)).length} seeds)`, 'semantic_invalid', { durationMs: Date.now() - t0 });
      out.push({ file: `L${String(i + 1).padStart(2, '0')}-${id}.json`, level: best.level, proof: best.proof });
    }
    rmSync(levelsDir, { recursive: true, force: true });
    for (const o of out) {
      writeJson(join(levelsDir, o.file), o.level);
      if (o.proof) writeJson(join(proofsDir, `${o.level.id}.json`), o.proof);
      written.push(o.level.id);
    }
    // Levels kept from before keep their proofs while those still win; a stale one is found again.
    if (freeform) {
      const proven = reproveLevels(ctx);
      if (!proven.ok) return fail(proven.summary, 'semantic_invalid', { durationMs: Date.now() - t0 });
    }
  }
  return ok(`wrote ${written.length} level(s): ${written.join(', ')} (target ${targetTicks} ticks; ${tried.length} candidates)`, { durationMs: Date.now() - t0, artifactPath: levelsDir });
};

// ---------------------------------------------------------------- publish

function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(p.slice(base.length + 1));
  }
  return out.sort();
}

const CONTENT_TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown' };

/** Assemble the bundle (built game, content, design, manifest, evidence, thumbnail), upload it and describe the version. */
const publish: StageFn = async (ctx) => {
  const t0 = Date.now();
  // A takedown withdrew this game's bundles; a job queued before it must not put them back.
  if ((await ctx.store.getGame(ctx.gameId).catch(() => null))?.state === 'removed') return fail('the game was removed by moderation; nothing was published', 'spec_violation');
  const dist = join(ctx.gameDir, 'dist');
  if (!existsSync(join(dist, 'game.js')) || !existsSync(join(dist, 'engine.js'))) return fail('dist/game.js or dist/engine.js missing; the budget stage must build first', 'spec_violation');
  const gddInfo = readGdd(ctx.gameDir);
  const sys = readSystems(ctx.gameDir);
  const stylePath = join(ctx.gameDir, 'design', 'style.json');
  if (!gddInfo || !sys || !existsSync(stylePath)) return fail('design artifacts missing', 'spec_violation');
  const style = StyleCard.parse(readJson(stylePath));
  const engineMeta = existsSync(join(dist, 'engine.json')) ? readJson<{ phaser?: string; sdk?: string }>(join(dist, 'engine.json')) : {};
  const reports = join(ctx.gameDir, 'reports');
  const bundleDir = join(ctx.gameDir, 'bundle');
  rmSync(bundleDir, { recursive: true, force: true });
  mkdirSync(join(bundleDir, 'content'), { recursive: true });
  mkdirSync(join(bundleDir, 'design'), { recursive: true });
  for (const f of ['index.html', 'engine.js', 'game.js', 'engine.json']) if (existsSync(join(dist, f))) copyFileSync(join(dist, f), join(bundleDir, f));
  const contentFiles = walk(join(ctx.gameDir, 'content'));
  for (const rel of contentFiles) {
    mkdirSync(join(bundleDir, 'content', rel, '..'), { recursive: true });
    copyFileSync(join(ctx.gameDir, 'content', rel), join(bundleDir, 'content', rel));
  }
  // content/index.json lists the content files of the bundle (the level editor loads levels and behaviours by it).
  writeJson(join(bundleDir, 'content', 'index.json'), {
    levels: contentFiles.filter((f) => f.startsWith('levels/') && f.endsWith('.json')),
    behaviour: contentFiles.filter((f) => f.startsWith('behaviour/') && f.endsWith('.fsm.json')),
    rules: contentFiles.filter((f) => f.startsWith('rules/') && f.endsWith('.json')),
    files: contentFiles.filter((f) => !f.includes('/') && f.endsWith('.json')),
  });
  for (const f of ['systems.json', 'style.json', 'feedback.json']) if (existsSync(join(ctx.gameDir, 'design', f))) copyFileSync(join(ctx.gameDir, 'design', f), join(bundleDir, 'design', f));
  copyFileSync(join(ctx.gameDir, 'design', 'gdd.md'), join(bundleDir, 'design', 'gdd.md'));
  const shots = existsSync(reports) ? readdirSync(reports).filter((f) => /^smoke-seed\d+-tick\d+\.png$/.test(f)).sort() : [];
  if (shots[0]) copyFileSync(join(reports, shots[0]), join(bundleDir, 'thumbnail.png'));

  const hash = createHash('sha256');
  for (const rel of walk(bundleDir)) if (rel === 'game.js' || rel.startsWith('content/') || rel.startsWith('design/')) hash.update(rel).update(readFileSync(join(bundleDir, rel)));
  const contentHash = hash.digest('hex');
  const versions = await ctx.store.listVersions(ctx.gameId);
  const bundlePath = `bundles/g/${ctx.gameId}/v/${ctx.versionId}`;
  // Remix lineage: walk origin versions back to the root (newest ancestor last).
  const lineage: Array<{ gameId: string; versionId: string; ownerHandle: string }> = [];
  let originId = (await ctx.store.getGame(ctx.gameId).catch(() => null))?.originVersionId ?? null;
  while (originId && lineage.length < 32) {
    const v = await ctx.store.getVersion(originId);
    if (!v) break;
    const og = await ctx.store.getGame(v.gameId).catch(() => null);
    lineage.unshift({ gameId: v.gameId, versionId: v.id, ownerHandle: og?.ownerId ?? 'unknown' });
    originId = og?.originVersionId ?? null;
  }
  const manifest = BundleManifest.parse({
    schema: 1,
    gameId: ctx.gameId,
    versionId: ctx.versionId,
    number: versions.length + 1,
    engine: { phaser: engineMeta.phaser ?? 'unknown', sdk: engineMeta.sdk ?? 'unknown', url: 'engine.js' },
    entry: 'game.js',
    genre: gddInfo.fm.genre,
    canvas: { w: style.canvas.w, h: style.canvas.h, scale: 'integer' },
    inputs: ['keyboard'],
    capabilities: { saves: false, multiplayer: false, testSeam: true },
    assets: [],
    contentHash,
    lineage,
    license: 'gg-remix-1.0',
    aiDisclosure: { preGenerated: ['design', 'systems', 'behaviour', 'levels'], liveGenerated: [] },
    builtAt: new Date().toISOString(),
  });
  writeJson(join(bundleDir, 'manifest.json'), manifest);

  const gates = existsSync(reports)
    ? readdirSync(reports)
        .filter((f) => /^gate-.*\.json$/.test(f))
        .sort()
        .map((f) => {
          const r = readJson<{ stage: string; passed: boolean; checks: Array<{ name: string; passed: boolean }>; durationMs: number }>(join(reports, f));
          return { stage: r.stage, passed: r.passed, checks: r.checks.map((c) => `${c.name}:${c.passed ? 'pass' : 'fail'}`), durationMs: r.durationMs };
        })
    : [];
  const playtestPath = join(reports, 'playtest-report.json');
  const playtest = existsSync(playtestPath) ? readJson<{ passed: boolean; replayHashMatch?: boolean; readyMs?: number; seeds: number[]; bots: Array<{ metrics?: Record<string, number>; ticks?: number; completed?: boolean }> }>(playtestPath) : null;
  const gameJs = readFileSync(join(bundleDir, 'game.js'));
  const evidence = {
    title: gddInfo.fm.title,
    gates,
    playtest: playtest ? { passed: playtest.passed, replayHashMatch: playtest.replayHashMatch ?? null, readyMs: playtest.readyMs ?? null, seeds: playtest.seeds, metrics: playtest.bots[0]?.metrics ?? {}, ticks: playtest.bots[0]?.ticks ?? null } : null,
    budget: { gameJsBytes: gameJs.length, contentFiles: walk(join(bundleDir, 'content')).length },
    thumbnail: shots[0] ? 'thumbnail.png' : null,
    builtAt: manifest.builtAt,
  };
  writeJson(join(bundleDir, 'evidence.json'), evidence);

  const g = genreOfGame(ctx);
  const panels = g.panels.map((spec) => {
    const entry = sys.systems.find((e) => e.id === spec.systemId);
    const current = entry?.params[spec.param];
    const fallback = catalogFor(sys)[spec.systemId]?.params[spec.param]?.default;
    return { ...spec, value: typeof current === 'number' ? current : typeof fallback === 'number' ? fallback : spec.min };
  });
  const files = walk(bundleDir);
  let bytes = 0;
  for (const rel of files) {
    const data = readFileSync(join(bundleDir, rel));
    bytes += data.length;
    const ext = rel.slice(rel.lastIndexOf('.'));
    await ctx.store.putObject('bundles', `g/${ctx.gameId}/v/${ctx.versionId}/${rel}`, new Uint8Array(data), CONTENT_TYPES[ext] ?? 'application/octet-stream');
  }
  return ok(`published ${files.length} files (${Math.round(bytes / 1024)} KB) to ${bundlePath}`, {
    durationMs: Date.now() - t0,
    artifactPath: bundleDir,
    version: { bundlePath, manifest: manifest as unknown as Record<string, unknown>, design: { gdd: gddInfo.fm, systems: sys, style, evidence, panels }, contentHash },
  });
};

// ---------------------------------------------------------------- edit routes without a model

const applyParams: StageFn = async (ctx) => {
  const route = ctx.route;
  if (!route) return fail('apply-params needs an edit route', 'spec_violation');
  const path = join(ctx.gameDir, 'design', 'systems.json');
  const before = readSystems(ctx.gameDir);
  if (!before) return fail('design/systems.json missing', 'spec_violation');
  const after = structuredClone(before);
  for (const { key, value } of route.paramPatch) {
    const [sysId, param] = key.split('.');
    const entry = after.systems.find((s) => s.id === sysId);
    if (!entry || !param) return fail(`system '${sysId}' is not selected in this game`, 'semantic_invalid');
    entry.params[param] = value;
  }
  const catalog = catalogFor(after);
  const check = checkSystems(after, catalog);
  if (!check.ok) return fail(`rejected: ${check.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`, 'semantic_invalid');
  const imp = impact(before, after, catalog);
  writeJson(path, after);
  let note = '';
  if (imp.levels) {
    const r = await levels(ctx);
    if (!r.ok) return r;
    note = `; levels regenerated (${r.summary})`;
  }
  if (!imp.levels && after.genre === 'freeform') {
    // A freeform game's recorded runs may no longer win under the new values: prove the levels again.
    const proven = reproveLevels(ctx);
    if (!proven.ok) return fail(`parameters applied, but ${proven.summary}`, 'semantic_invalid');
    note = `; ${proven.summary}`;
  }
  return ok(`applied ${route.paramPatch.length} parameter(s): ${imp.changed.join(', ')}; impact levels=${imp.levels} assets=${imp.assets}${note}`, { artifactPath: path });
};

const applyStyle: StageFn = async (ctx) => {
  const route = ctx.route;
  if (!route) return fail('apply-style needs an edit route', 'spec_violation');
  const path = join(ctx.gameDir, 'design', 'style.json');
  if (!existsSync(path)) return fail('design/style.json missing', 'spec_violation');
  const style = readJson<Record<string, unknown>>(path);
  for (const { key, value } of route.paramPatch) {
    const parts = key.split('.');
    let node: Record<string, unknown> = style;
    for (const p of parts.slice(0, -1)) {
      if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
      node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = value;
  }
  const parsed = StyleCard.safeParse(style);
  if (!parsed.success) return fail(`style.json rejected: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'semantic_invalid');
  writeJson(path, parsed.data);
  return ok(`applied ${route.paramPatch.length} style value(s): ${route.paramPatch.map((p) => p.key).join(', ')}`, { artifactPath: path });
};

/**
 * Levels authored in the editor replace the files with the same ids, each one only after the genre validator and the
 * solver bot (over this game's systems, behaviours and content) accept it: the same oracle the levels stage uses.
 */
const applyContent: StageFn = async (ctx) => {
  const t0 = Date.now();
  const content = ctx.edit?.content;
  if (!content) return fail('apply-content needs authored content on the edit request', 'spec_violation');
  const g = genreOfGame(ctx);
  const sys = readSystems(ctx.gameDir);
  if (!sys) return fail('design/systems.json missing', 'spec_violation');
  const kit = { runtime: g, validate: g.levelGrammar.validate, bots: g.bots, solverBot: g.solverBot };
  const inputs = readGameInputs(ctx.gameDir);
  const levelsDir = join(ctx.gameDir, 'content', 'levels');
  const files = listJson(levelsDir);
  const existing = new Map(files.map((f) => [readJson<LevelJson>(f).id, f]));
  const accepted: Array<{ file: string; level: LevelJson; ticks: number; proof?: LevelProof }> = [];
  for (const raw of content.levels) {
    const parsed = LevelJson.safeParse(raw);
    if (!parsed.success) return fail(`level rejected by the schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'schema_invalid', { durationMs: Date.now() - t0 });
    const file = existing.get(parsed.data.id);
    if (!file) return fail(`level '${parsed.data.id}' does not exist in this game (levels: ${[...existing.keys()].join(', ') || 'none'})`, 'semantic_invalid', { durationMs: Date.now() - t0 });
    const prev = readJson<LevelJson>(file);
    const level: LevelJson = { ...parsed.data, ramp: parsed.data.ramp ?? prev.ramp };
    const index = files.indexOf(file);
    const rejected = (r: ValidationReport) => fail(`level '${level.id}' rejected: ${r.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`, 'semantic_invalid', { durationMs: Date.now() - t0 });
    if (sys.genre === 'freeform') {
      // A freeform game's solver replays recorded runs, which an authored level has not got: the validator, then a run
      // that wins it at its seed (the base genre's solver under the base names, else the explorer).
      const report = g.levelGrammar.validate(level, g.feelPresets[sys.feelPreset] ?? g.feelPresets[g.defaultFeel]!);
      if (!report.ok) return rejected(report);
      const base = BASE_MANIFESTS[sys.composition.base];
      const proven = proveLevel(level, index, { file: sys, roster: compositionOf(ctx.gameDir).roster, ...inputs, solver: base.bots[base.solverBot], budget: 40_000 });
      if (!proven.proof) return fail(`no winning run found for '${level.id}': ${proven.tried.join('; ')}`, 'semantic_invalid', { durationMs: Date.now() - t0 });
      accepted.push({ file, level, ticks: proven.proof.ticks, proof: proven.proof });
      continue;
    }
    // Checked at the seed the game plays it with: level i at levelSeed(1, i), as every oracle proves it.
    const check = checkLevel(kit, level, sys, inputs, { seed: levelSeed(DEFAULT_SEED, index) });
    if (!check.report.ok) return rejected(check.report);
    if (!check.solver?.completed) return fail(`the ${g.solverBot} bot could not finish '${level.id}' within 90 s (deaths ${check.solver?.deaths ?? 0}, longest stall ${Math.round((check.solver?.stuckMaxTicks ?? 0) / 60)} s)`, 'semantic_invalid', { durationMs: Date.now() - t0 });
    accepted.push({ file, level, ticks: check.solver.ticks });
  }
  // Written only once every level of the edit is accepted, each with its run.
  for (const a of accepted) {
    writeJson(a.file, a.level);
    if (a.proof) writeJson(join(ctx.gameDir, 'content', 'proofs', `${a.level.id}.json`), a.proof);
  }
  return ok(`applied ${accepted.length} authored level(s): ${accepted.map((a) => `${a.level.id} (${a.proof?.by ?? 'solver'} ${Math.round(a.ticks / 60)} s)`).join(', ')}`, { durationMs: Date.now() - t0, artifactPath: levelsDir });
};

/** Stages the worker implements itself: structured data stages, the scaffold, model-free level search, publishing, edit patches. */
export class WorkerRunner implements Runner {
  readonly kind = 'worker' as const;
  private readonly stages: Record<string, StageFn> = { gdd, systems, composition, scaffold: scaffoldStage, behaviour, prove, levels, publish, 'apply-params': applyParams, 'apply-style': applyStyle, 'apply-content': applyContent };

  async run(ctx: StageContext): Promise<StageOutcome> {
    const fn = this.stages[ctx.spec.stage];
    if (!fn) return fail(`no worker implementation for stage '${ctx.spec.stage}'`, 'spec_violation');
    const t0 = Date.now();
    try {
      const out = await fn(ctx);
      ctx.log(`stage ${ctx.spec.stage}: ${out.summary.slice(0, 160)}`);
      return { ...out, durationMs: out.durationMs || Date.now() - t0 };
    } catch (e) {
      return fail(`${ctx.spec.stage}: ${(e as Error).message}`, 'infra', { durationMs: Date.now() - t0 });
    }
  }
}
