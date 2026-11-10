import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelProof } from '@gg/schemas';
import { levelPlan, systemsJsonFor } from '@gg/template-core';
import { BASE_MANIFESTS, freeformManifest, HEIST, HIVE, LANTERN, LOSTDOG, proveLevel } from '@gg/template-freeform/node';
import { describe, expect, it } from 'vitest';
import { CHECKS, kitFor } from './check.js';
import { CATALOG, castOf, catalogFor, checkGameStory, checkGameSystems, checkProofs, GENRES, manifestFor, readGameFiles, readGameLevels, resolveGame, settingOf, storyFactsOf, type GameFiles } from './node.js';

const samples = fileURLToPath(new URL('../../../samples/', import.meta.url));

/** A game directory holding the given design and content files. */
function gameDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gg-resolve-'));
  for (const [rel, v] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), typeof v === 'string' ? v : JSON.stringify(v));
  }
  return dir;
}
const gddMd = (fm: unknown) => `---\n${JSON.stringify(fm)}\n---\n## Concept\nx\n`;

/** A genre's sample game, or one made from its defaults while it has none yet (the castle until its sample ships). */
function sampleOf(id: string): string {
  if (existsSync(join(samples, id))) return join(samples, id);
  const g = GENRES[id]!;
  const fm = { title: 'Sample', genre: id, scopeTier: 'medium', pillars: g.gddDefaults.pillars, scope: g.scopeBudget['medium'], targets: g.gddDefaults.targets, verbs: g.gddDefaults.verbs, feedbackEvents: g.gddDefaults.feedbackEvents };
  return gameDir({ 'design/systems.json': systemsJsonFor(g), 'design/gdd.md': gddMd(fm) });
}

describe('resolveGame', () => {
  it('a curated game resolves to its genre, the very object the registry holds', () => {
    for (const id of Object.keys(GENRES)) expect(resolveGame(sampleOf(id)), id).toBe(GENRES[id]);
    expect(manifestFor({}, 'shmup')).toBe(GENRES['shmup']);
    expect(catalogFor({ genre: 'shmup' })).toBe(CATALOG);
    expect(kitFor({ version: 1, genre: 'puzzle', feelPreset: 'grid-snappy', systems: [{ id: 'grid-push', params: {} }] })).toBe(CHECKS['puzzle']);
  });

  it('a freeform game resolves to its composition: before its systems, the base offering every usable system', () => {
    const designOnly = resolveGame(gameDir({ 'design/gdd.md': gddMd(HEIST.gdd) }));
    expect(designOnly.id).toBe('freeform');
    expect(designOnly.levelGrammar.kind).toBe('rooms');
    expect(Object.keys(designOnly.systems)).toEqual(expect.arrayContaining(['auto-attack', 'melee-attack', 'objectives']));
    const dir = gameDir({ 'design/gdd.md': gddMd(HEIST.gdd), 'design/systems.json': HEIST.systems, 'content/entities.json': HEIST.roster });
    const m = resolveGame(dir);
    expect(m.id).toBe('freeform');
    expect(Object.keys(m.systems)).toEqual(HEIST.systems.systems.map((s) => s.id));
    expect(m.entityDefs.map((d) => d.type)).toEqual(expect.arrayContaining(['guard', 'sentry', 'shard']));
    expect(m.composedParams).toEqual({ 'auto-attack': { dropType: 'shard' }, 'room-clear': { healType: 'cell' } });
    expect(m.solverBot).toBe('proof');
    expect(readGameFiles(dir).roster).toEqual(HEIST.roster);
    expect(catalogFor(HEIST.systems)['objectives']).toBeDefined();
    expect(kitFor(HEIST.systems, { roster: HEIST.roster }).runtime.entityDefs).toEqual(m.entityDefs);
  });

  it('says why when it cannot tell', () => {
    expect(() => manifestFor({})).toThrow(/cannot determine the genre/);
    expect(() => manifestFor({}, 'freeform')).toThrow(/base genre comes from its GDD/);
    expect(() => manifestFor({}, 'deckbuilder')).toThrow(/unknown genre/);
  });
});

describe('checkProofs', () => {
  /** LANTERN as the scaffold leaves it: its levels in play order, each with the run that wins it at its seed. */
  function lantern(): string {
    const m = freeformManifest(LANTERN.systems, LANTERN.roster);
    const base = BASE_MANIFESTS[LANTERN.systems.composition.base];
    const content = { objectives: LANTERN.objectives };
    const files: Record<string, unknown> = { 'design/systems.json': LANTERN.systems, 'content/entities.json': LANTERN.roster, 'content/objectives.json': LANTERN.objectives };
    for (const slot of levelPlan(m.levelGrammar.kind, { levels: LANTERN.gdd.scope.levels, bosses: 0, tier: 'small' })) {
      const level = { ...m.levelGrammar.generate({ seed: slot.index + 1, difficulty: slot.difficulty }), id: slot.id };
      const r = proveLevel(level, slot.index, { file: LANTERN.systems, roster: LANTERN.roster, content, solver: base.bots[base.solverBot], budget: 20_000 });
      expect(r.proof, slot.id).not.toBeNull();
      files[`content/levels/L0${slot.index + 1}-${slot.id}.json`] = level;
      files[`content/proofs/${slot.id}.json`] = r.proof;
    }
    return gameDir(files);
  }

  it("a freeform game passes when every level has a run at its seed that still wins, replayed on the game's names", () => {
    const dir = lantern();
    expect(readGameLevels(dir).map((l) => [l.level.id, l.seed])).toEqual([['l01', 1], ['l02', 2], ['l03', 3]]);
    const r = checkProofs(dir);
    expect(r.issues).toEqual([]);
    expect(r.metrics).toMatchObject({ proven: 3, replayed: true });
  });

  it('names each level without a run, with a run recorded at another seed, or whose run no longer wins', () => {
    const dir = lantern();
    const proofs = readGameFiles(dir).proofs;
    rmSync(join(dir, 'content', 'proofs', 'l01.json'));
    const write = (p: LevelProof) => writeFileSync(join(dir, 'content', 'proofs', `${p.level}.json`), JSON.stringify(p));
    write({ ...proofs.find((p) => p.level === 'l02')!, seed: 9 });
    // The run stops a second in: the level is not won yet.
    write({ ...proofs.find((p) => p.level === 'l03')!, ticks: 60 });
    const r = checkProofs(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => [i.code, i.at?.path])).toEqual([['no_proof', 'l01'], ['proof_seed', 'l02'], ['stale_proof', 'l03']]);
  });

  it("a curated game passes: its genre's solver bot proves its levels", () => {
    const r = checkProofs(join(samples, 'platformer'));
    expect(r.ok).toBe(true);
    expect(r.metrics['curated']).toBe(true);
  });
});

describe('checkGameSystems', () => {
  it("a curated game is checked against its catalog and its GDD: each genre's defaults pass with its sample's GDD", () => {
    for (const [id, g] of Object.entries(GENRES)) {
      const dir = gameDir({ 'design/systems.json': systemsJsonFor(g), 'design/gdd.md': readFileSync(join(sampleOf(id), 'design', 'gdd.md'), 'utf8') });
      expect(checkGameSystems(dir).issues.filter((i) => i.severity === 'error'), id).toEqual([]);
    }
  });

  it('a freeform game counts the content still to come: the waves its generator writes, the rules its composition writes', () => {
    // At the systems stage: neither the arena's waves nor the objectives exist yet.
    const dir = gameDir({ 'design/gdd.md': gddMd(HIVE.gdd), 'design/systems.json': HIVE.systems });
    expect(checkGameSystems(dir).issues.filter((i) => i.severity === 'error')).toEqual([]);
    // Once the composition has written the roster, the objectives it should have written with it are missing.
    mkdirSync(join(dir, 'content'));
    writeFileSync(join(dir, 'content', 'entities.json'), JSON.stringify(HIVE.roster));
    expect(checkGameSystems(dir).issues.map((i) => i.code)).toContain('missing_content');
    writeFileSync(join(dir, 'content', 'objectives.json'), JSON.stringify(HIVE.objectives));
    expect(checkGameSystems(dir).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it("holds the content the design stage wrote to the game's rules: what leaves nothing to farm fails, a poor buy warns", () => {
    const sys = systemsJsonFor(GENRES['lifesim']!);
    const gdd = readFileSync(join(samples, 'lifesim', 'design', 'gdd.md'), 'utf8');
    const crops = JSON.parse(readFileSync(join(samples, 'lifesim', 'content', 'crops.json'), 'utf8')) as { version: 1; crops: Array<Record<string, unknown>> };
    const farm = (systems: unknown, table: unknown) => checkGameSystems(gameDir({ 'design/systems.json': systems, 'design/gdd.md': gdd, 'content/crops.json': table }));
    expect(farm(sys, crops).issues).toEqual([]);
    // A three-day season: three of the sample's four crops never ripen in it, a warning each.
    const short = { ...sys, systems: sys.systems.map((x) => (x.id === 'season' ? { ...x, params: { ...x.params, days: 3 } } : x)) };
    const r = farm(short, crops);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toEqual(['crop_trap', 'crop_trap', 'crop_trap']);
    expect(farm(sys, { version: 1, crops: crops.crops.map((c) => ({ ...c, growDays: 9 })) }).issues.filter((i) => i.severity === 'error').map((i) => i.code)).toContain('crops_unripe');
    expect(farm(sys, { version: 1 }).issues.map((i) => i.code)).toEqual(['crops_schema']);
    // A game whose systems read no crops has none to check.
    const platformer = gameDir({ 'design/systems.json': systemsJsonFor(GENRES['platformer']!), 'design/gdd.md': readFileSync(join(samples, 'platformer', 'design', 'gdd.md'), 'utf8'), 'content/crops.json': { version: 1 } });
    expect(checkGameSystems(platformer).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it("weighs a game's bespoke systems in the composition rules by their contracts (design/mechanics.json)", () => {
    const bell = { id: 'bell', summary: 'A bell rung with the action key.', controls: { action: 'ring the bell' }, emits: ['custom:ring'], hud: ['rings'] };
    const freeform = (mechanics: unknown) => checkGameSystems(gameDir({ 'design/gdd.md': gddMd(HIVE.gdd), 'design/systems.json': HIVE.systems, 'content/entities.json': HIVE.roster, 'content/objectives.json': HIVE.objectives, 'design/mechanics.json': { version: 1, mechanics } }));
    expect(freeform([]).issues.filter((i) => i.severity === 'error')).toEqual([]);
    // The hive's melee strikes on the action key: a bell on the same key gives it two uses.
    expect(freeform([bell]).issues.map((i) => i.code)).toContain('key_twice');
    expect(freeform([{ ...bell, controls: { jump: 'ring the bell' } }]).issues.filter((i) => i.severity === 'error')).toEqual([]);
    // A second way to move the player, or to win, does not fit.
    expect(freeform([{ ...bell, controls: {}, provides: { movement: 'topdown' } }]).issues.map((i) => i.code)).toContain('two_movements');
    expect(freeform([{ ...bell, controls: {}, provides: { win: 'survive' } }]).issues.map((i) => i.code)).toContain('two_wins');
    expect(freeform([{ ...bell, id: 'melee-attack', controls: {} }]).issues.map((i) => i.code)).toContain('mechanic_shadows');
    expect(freeform([{ id: 'Bell' }]).issues.map((i) => i.code)).toContain('mechanics_invalid');

    // A curated game answers only for what its bespoke systems add: a second win beside the platformer's goal.
    const platformer = (mechanics: unknown) => checkGameSystems(gameDir({ 'design/systems.json': systemsJsonFor(GENRES['platformer']!), 'design/gdd.md': readFileSync(join(samples, 'platformer', 'design', 'gdd.md'), 'utf8'), 'design/mechanics.json': { version: 1, mechanics } }));
    expect(platformer([{ ...bell, controls: { action: 'ring the bell' } }]).issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(platformer([{ ...bell, controls: {}, provides: { win: 'objectives' } }]).issues.filter((i) => i.severity === 'error').map((i) => i.code)).toEqual(['two_wins']);
  });

  it("holds a freeform game's objectives to its roster: a rule about an entity the game has not got is an error", () => {
    const objectives = { ...LANTERN.objectives!, win: { mode: 'all' as const, clauses: [{ kind: 'collect' as const, type: 'firefly', count: 2 }] } };
    const dir = gameDir({ 'design/gdd.md': gddMd(LANTERN.gdd), 'design/systems.json': LANTERN.systems, 'content/entities.json': LANTERN.roster, 'content/objectives.json': objectives });
    const r = checkGameSystems(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('objective_type');
    expect(checkGameSystems(gameDir({ 'design/systems.json': { version: 1 } })).issues[0]?.code).toBe('systems_schema');
    expect(checkGameSystems(gameDir({})).issues[0]?.code).toBe('systems_missing');
  });
});

describe("a game's story, held to the game it is told in", () => {
  it("holds the castle sample's story: its two people, the events and types its deeds hear, its one region, all heard", () => {
    const dir = join(samples, 'castle');
    const facts = storyFactsOf(dir);
    expect([facts.speakers, facts.levels]).toEqual([['hermit', 'candle-keeper'], 1]);
    expect(facts.events).toEqual(expect.arrayContaining(['death', 'pickup', 'custom:door_open']));
    expect(facts.types).toEqual(expect.arrayContaining(['headsman', 'wings']));
    expect(checkGameStory(dir)).toMatchObject({ ok: true, issues: [], metrics: { story: true, endings: 3, quests: 1 } });
  });

  it("takes a composed game's people from its talk: those it places are its people, the block's own person aside", () => {
    const talk = LOSTDOG.content!['dialogue'];
    const feedback = [{ event: 'custom:talk', channels: ['sfx'] }, { event: 'custom:quest', channels: ['sfx'] }, { event: 'custom:ending', channels: ['sfx'] }];
    const dir = gameDir({ 'design/systems.json': LOSTDOG.systems, 'design/gdd.md': gddMd(LOSTDOG.gdd), 'content/entities.json': LOSTDOG.roster, 'content/dialogue.json': talk, 'design/feedback.json': feedback });
    try {
      const facts = storyFactsOf(dir);
      expect([facts.people, facts.speakers, facts.levels]).toEqual([true, [], 2]);
      expect(facts.types).toEqual(expect.arrayContaining(['wolf', 'villager']));
      expect(checkGameStory(dir)).toMatchObject({ ok: true, issues: [], metrics: { story: true, people: 4, endings: 2, quests: 1 } });
      // The kit that checks its levels knows who stands where: a level without the baker is missing her.
      expect(readGameFiles(dir).dialogue?.people).toHaveLength(4);
      // Without the talk block, the same talk places nobody.
      const plain = { ...LOSTDOG.systems, systems: LOSTDOG.systems.systems.filter((x) => x.id !== 'talk') };
      writeFileSync(join(dir, 'design', 'systems.json'), JSON.stringify(plain));
      expect(storyFactsOf(dir).people).toBe(false);
      expect(checkGameStory(dir).issues.map((i) => i.code)).toContain('people_unplaced');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes a game with no story, and finds a story its game cannot tell', () => {
    expect(checkGameStory(join(samples, 'platformer'))).toMatchObject({ ok: true, metrics: { story: false } });
    const dir = mkdtempSync(join(tmpdir(), 'gg-story-'));
    try {
      mkdirSync(join(dir, 'design'), { recursive: true });
      mkdirSync(join(dir, 'content'), { recursive: true });
      writeFileSync(join(dir, 'design', 'gdd.md'), readFileSync(join(samples, 'castle', 'design', 'gdd.md'), 'utf8'));
      writeFileSync(join(dir, 'design', 'feedback.json'), '[]');
      const talk = { version: 1, nodes: [{ id: 'end', speaker: 'narrator', lines: ['The end.'] }], starts: [{ speaker: 'oracle', node: 'end' }], deeds: [{ on: 'death', type: 'dragon', set: { slain: true } }], endings: [{ id: 'slain', title: 'Slain', when: [{ flag: 'slain', is: true }], node: 'end' }, { id: 'end', title: 'End', node: 'end' }], chapters: [{ level: 4, title: 'Beyond' }] };
      writeFileSync(join(dir, 'content', 'dialogue.json'), JSON.stringify(talk));
      const codes = checkGameStory(dir).issues.map((i) => i.code).sort();
      expect(codes).toEqual(['chapter_beyond', 'deed_type_unknown', 'speaker_unplaced', 'story_unheard', 'story_unheard']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a game that drives', () => {
  const driving = (kind: string): Partial<GameFiles> => ({
    systems: {
      version: 1,
      genre: 'freeform',
      composition: { base: 'survivors' },
      feelPreset: BASE_MANIFESTS.survivors.defaultFeel,
      systems: [
        { id: 'movement-vehicle', params: { kind } },
        { id: 'objectives', params: {} },
      ],
    },
  });

  it('casts its player as the vehicle, and draws a game that sails at sea', () => {
    for (const [kind, setting] of [['bike', 'field'], ['car', 'field'], ['boat', 'sea'], ['galleon', 'sea']] as const) {
      const files = driving(kind);
      expect(castOf(files)[0], kind).toEqual({ type: '@player', role: 'player', recipe: `vehicle-${kind}` });
      expect(settingOf(files, manifestFor(files)), kind).toBe(setting);
    }
    // A game that walks is cast and drawn as before.
    const walks = { systems: { ...driving('car').systems!, systems: [{ id: 'movement-topdown', params: {} }, { id: 'objectives', params: {} }] } };
    expect(castOf(walks)[0]!.recipe).toBe('hero-topdown');
    expect(settingOf(walks, manifestFor(walks))).toBe('field');
  });
});
