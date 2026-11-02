import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DialogueFile, LevelJson, MoveSet, StoryBible, type BehaviourFsm, type Condition, type Move } from '@gg/schemas';
import { createSim, type EntityDef } from '@gg/sdk';
import { afkWins, levelTicksOf, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { frameSize, playerRecipe, RECIPES, RIGS, SETTING_BY_GENRE, type Setting } from '@gg/sdk/art';
import { GENRES, readGameInputs, readGameLevels, resolveGame } from '@gg/templates/node';
import { storyMentions, wantsStory } from '@gg/worker-generator';

/**
 * The bar, written down. Each line is something a reference-tier game shows, with a number to reach; `most` lines are
 * a ceiling instead. A line nothing can measure yet reads as pending, never as a pass.
 */
export interface RubricLine {
  id: string;
  area: 'characters' | 'combat' | 'world' | 'look' | 'sound' | 'story' | 'play';
  text: string;
  target: number;
  most?: boolean;
}

/** The castle tier's bar (Track R decision 14): side-view action and exploration at the reference games' quality. */
export const CASTLE_RUBRIC: readonly RubricLine[] = [
  { id: 'hero_height', area: 'characters', text: 'the hero is drawn at least 40 px tall', target: 40 },
  { id: 'hero_clips', area: 'characters', text: 'the hero has at least 10 animation clips', target: 10 },
  { id: 'telegraph_ms', area: 'combat', text: 'every instant hit is telegraphed for at least 150 ms', target: 150 },
  { id: 'boss_phases', area: 'combat', text: 'a boss with at least 2 phases', target: 2 },
  { id: 'rooms', area: 'world', text: 'at least 12 rooms', target: 12 },
  { id: 'ability_gates', area: 'world', text: 'at least 2 ability gates', target: 2 },
  { id: 'shortcut_loops', area: 'world', text: 'at least 1 shortcut loop', target: 1 },
  { id: 'altar_spacing', area: 'world', text: 'at most 4 rooms between save altars', target: 4, most: true },
  { id: 'parallax_layers', area: 'look', text: 'at least 3 parallax layers behind the play', target: 3 },
  { id: 'npcs', area: 'story', text: 'at least 4 characters to talk to', target: 4 },
  { id: 'endings', area: 'story', text: 'at least 2 endings', target: 2 },
  { id: 'music_cues', area: 'sound', text: 'music for every region and boss', target: 1 },
  { id: 'idle_loses', area: 'play', text: 'standing still never wins a fight', target: 1 },
];

/** What a game is made of, as the rubric reads it. */
export interface RubricInputs {
  genre: string;
  entityDefs: readonly EntityDef[];
  player: { w: number; h: number };
  behaviours: readonly BehaviourFsm[];
  levels: readonly LevelJson[];
  /** The asset manifest's entries, by kind. */
  assets: ReadonlyArray<{ kind: string }>;
  /** How many endings the story writes (absent: the one fixed ending screen). */
  endings?: number;
  /** The game's moves (content/moves.json, else the genre's own): a foe's blow winds up over its move's startup. */
  moves?: readonly Move[];
}

/** Parallax layers the view draws behind the play in each setting (phaser-view's scenery). */
const PARALLAX: Readonly<Record<Setting, number>> = { side: 3, space: 3, dungeon: 0, field: 0, farm: 0, castle: 3 };

const timerOf = (c: Condition): number => (c.kind === 'timer_elapsed' ? c.ms : c.kind === 'all' ? Math.max(0, ...c.of.map(timerOf)) : c.kind === 'any' ? Math.min(...c.of.map(timerOf)) : 0);
const hpThresholds = (c: Condition): number[] => (c.kind === 'hp_below' ? [c.fraction] : c.kind === 'all' || c.kind === 'any' ? c.of.flatMap(hpThresholds) : []);

/** Each line's measured value, or null where nothing measures it yet. */
export function measure(g: RubricInputs): Record<string, number | null> {
  const setting = SETTING_BY_GENRE[g.genre] ?? 'side';
  const recipe = RECIPES[playerRecipe(setting, g.player.w)];
  // The castle tier draws its hero with the knight's rig: its body and its clips are the hero's.
  const rig = setting === 'castle' ? RIGS['knight'] : undefined;
  // The shortest wait in a state that leads into an instant hit, or the shortest wind-up of a foe's harmful move: what the
  // player has to see it coming.
  let telegraph: number | null = null;
  for (const m of g.moves ?? []) {
    if (m.owner === 'player' || m.damage <= 0 || (m.hitboxes.length === 0 && !m.projectile)) continue;
    telegraph = Math.min(telegraph ?? Infinity, Math.round((m.startup * 1000) / 60));
  }
  for (const fsm of g.behaviours) {
    for (const [n, s] of Object.entries(fsm.states)) {
      if (![...s.onEnter, ...s.update].some((a) => a.kind === 'damage_player')) continue;
      for (const from of Object.values(fsm.states)) for (const t of from.transitions) if (t.to === n) telegraph = Math.min(telegraph ?? Infinity, timerOf(t.when));
    }
  }
  const bossFsmIds = new Set(g.entityDefs.filter((d) => d.boss && d.fsm).map((d) => d.fsm));
  const bossFsms = g.behaviours.filter((f) => bossFsmIds.has(f.id));
  const phases = bossFsms.length ? Math.max(...bossFsms.map((f) => 1 + new Set(Object.values(f.states).flatMap((s) => s.transitions.flatMap((t) => hpThresholds(t.when)))).size)) : 0;
  const rooms = g.levels.reduce((n, l) => n + ((l as { rooms?: unknown[] }).rooms?.length ?? 1), 0);
  // The world lines from the genre's own validator where it measures them (the castle's world solver), over every region:
  // the relics that gate the way out, the shortcuts that loop back to a rest, and the longest stretch with no altar.
  const manifest = GENRES[g.genre];
  const feel = manifest?.feelPresets[manifest.defaultFeel];
  const regions = g.levels.filter((l) => (l.rooms?.length ?? 0) > 0 && LevelJson.safeParse(l).success);
  const metrics = manifest && feel ? regions.map((l) => manifest.levelGrammar.validate(l, feel).metrics) : [];
  const most = (key: string): number | null => {
    const vs = metrics.map((m) => m[key]).filter((v): v is number => typeof v === 'number');
    return vs.length ? Math.max(...vs) : null;
  };
  // Standing still through each region for as long as the game lets a level last, with its foes, its boss and its rules:
  // it must win none.
  const options = manifest ? simOptionsFor(manifest, systemsJsonFor(manifest), { behaviours: [...g.behaviours], ...(g.moves ? { content: { moves: { version: 1, moves: [...g.moves] } } } : {}) }) : null;
  const idleLoses = options && regions.length ? (regions.every((l) => !afkWins(() => createSim({ ...options, level: l, seed: 1 }), levelTicksOf(options))) ? 1 : 0) : null;
  return {
    hero_height: rig ? rig.body.h : recipe ? frameSize(recipe).h - 2 : null,
    hero_clips: rig ? rig.clips.length : recipe ? Object.keys(recipe.anims).length : null,
    telegraph_ms: telegraph,
    boss_phases: phases,
    rooms,
    ability_gates: most('abilityGates'),
    shortcut_loops: most('shortcutLoops'),
    altar_spacing: most('longestStretch'),
    parallax_layers: PARALLAX[setting] + g.assets.filter((a) => a.kind === 'backdrop').length,
    npcs: g.entityDefs.filter((d) => (d as { npc?: boolean }).npc).length,
    endings: g.endings ?? 1,
    music_cues: g.assets.filter((a) => a.kind === 'music').length,
    idle_loses: idleLoses,
  };
}

export interface RubricResult {
  id: string;
  area: RubricLine['area'];
  text: string;
  target: number;
  value: number | null;
  /** null: not measured yet. */
  pass: boolean | null;
}

/**
 * Each line against its target. A line whose value is null is not measured yet (pending, never a pass); a line whose
 * value is undefined does not apply to the game (a rich story's endings, in a light one) and is left out.
 */
export function grade(lines: readonly RubricLine[], values: Record<string, number | null | undefined>): { results: RubricResult[]; passed: number; measured: number; total: number } {
  const results = lines.filter((l) => values[l.id] !== undefined).map((l) => {
    const value = values[l.id] ?? null;
    return { id: l.id, area: l.area, text: l.text, target: l.target, value, pass: value === null ? null : l.most ? value <= l.target : value >= l.target };
  });
  return { results, passed: results.filter((r) => r.pass === true).length, measured: results.filter((r) => r.pass !== null).length, total: results.length };
}

/** The rubric's inputs read from a built game's directory. */
export function rubricInputsOf(gameDir: string): RubricInputs {
  const g = resolveGame(gameDir);
  const { behaviours, content } = readGameInputs(gameDir);
  const dir = join(gameDir, 'content', 'levels');
  const levels = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as LevelJson) : [];
  const manifest = join(gameDir, 'assets', 'manifest.json');
  const assets = existsSync(manifest) ? ((JSON.parse(readFileSync(manifest, 'utf8')) as { assets?: Array<{ kind: string }> }).assets ?? []) : [];
  // The game's own behaviours over the template's, as the sim takes them; its moves, else the ones its genre ships.
  const all = [...g.defaultBehaviours.filter((b) => !behaviours.some((f) => f.id === b.id)), ...behaviours];
  const moves = MoveSet.safeParse(content['moves'] ?? g.shippedContent?.['moves']);
  // Its story's endings, likewise (none: the one fixed end screen).
  const talk = DialogueFile.safeParse(content['dialogue'] ?? g.shippedContent?.['dialogue']);
  const endings = talk.success ? (talk.data.endings ?? []).length : 0;
  return { genre: g.id, entityDefs: g.entityDefs, player: g.player, behaviours: all, levels, assets, ...(moves.success ? { moves: moves.data.moves } : {}), ...(endings > 0 ? { endings } : {}) };
}

/**
 * The story's bar, for every genre (R6.3): an idea that asks for a story is told one, and every story is told with the
 * craft the reference games show. Every level has a chapter, the first opens on narration, and the story ends; a rich
 * story has endings to choose between, people placed where they can be met, and a quest where its people talk; no word
 * of it names another work. A line that does not apply to the story told is left out, so a light story is graded only
 * on what a light story is.
 */
export const STORY_RUBRIC: readonly RubricLine[] = [
  { id: 'story_told', area: 'story', text: 'an idea that asks for a story is told one', target: 1 },
  { id: 'chapters', area: 'story', text: 'every level has a chapter', target: 1 },
  { id: 'prologue', area: 'story', text: 'the first level opens on narration', target: 1 },
  { id: 'story_ends', area: 'story', text: 'the story ends, with an epilogue', target: 1 },
  { id: 'rich_endings', area: 'story', text: 'a rich story has at least 2 endings', target: 2 },
  { id: 'people_met', area: 'story', text: 'a rich story places at least 2 people to talk to where they can be met', target: 2 },
  { id: 'quest', area: 'story', text: 'where people talk, at least 1 quest', target: 1 },
  { id: 'clean_text', area: 'story', text: 'no word of the story names another work', target: 0, most: true },
];

/** What a game's story is made of, as the story bar reads it. */
export interface StoryInputs {
  /** The idea asks for a story in so many words. */
  asked: boolean;
  /** How deep its story plan goes (design/story.json; none without one). */
  depth: StoryBible['depth'];
  /** The talk it tells (its own, else its genre's), or null for none. */
  talk: DialogueFile | null;
  /** How many levels it has. */
  levels: number;
  /** The people standing in its levels with a talk to start: speakers, each counted once. */
  placed: number;
  /** Names of other works its story's words carry. */
  mentions: number;
}

/** Each story line's value; undefined where the line does not apply (no story told; a light story's rich lines). */
export function measureStory(s: StoryInputs): Record<string, number | undefined> {
  const t = s.talk;
  const rich = t !== null && s.depth === 'rich';
  const chaptered = new Set((t?.chapters ?? []).map((c) => c.level));
  return {
    story_told: s.asked ? (t !== null && s.depth !== 'none' ? 1 : 0) : undefined,
    chapters: t ? (Array.from({ length: s.levels }, (_, i) => i + 1).every((l) => chaptered.has(l)) ? 1 : 0) : undefined,
    prologue: t ? ((t.chapters ?? []).some((c) => c.level === 1 && c.node !== undefined) ? 1 : 0) : undefined,
    story_ends: t ? ((t.endings ?? []).length > 0 ? 1 : 0) : undefined,
    rich_endings: rich ? (t.endings ?? []).length : undefined,
    people_met: rich ? s.placed : undefined,
    quest: t && t.starts.length > 0 ? (t.quests ?? []).length : undefined,
    clean_text: t ? s.mentions : undefined,
  };
}

/** The story bar's inputs read from a built game's directory, and the idea it was made from. */
export function storyInputsOf(gameDir: string, idea: string): StoryInputs {
  const g = resolveGame(gameDir);
  const { content } = readGameInputs(gameDir);
  const parsed = DialogueFile.safeParse(content['dialogue'] ?? g.shippedContent?.['dialogue']);
  const talk = parsed.success ? parsed.data : null;
  const path = join(gameDir, 'design', 'story.json');
  const bible = existsSync(path) ? StoryBible.safeParse(JSON.parse(readFileSync(path, 'utf8'))) : null;
  const levels = readGameLevels(gameDir).map((l) => l.level);
  // Someone to talk to stands in a level: a type marked as one, talking as its speaker prop (else its type), with a start.
  const npc = new Set(g.entityDefs.filter((d) => (d as { npc?: boolean }).npc === true).map((d) => d.type));
  const speaks = new Set((talk?.starts ?? []).map((s) => s.speaker));
  const placed = new Set(levels.flatMap((l) => l.entities.filter((e) => npc.has(e.type)).map((e) => (typeof e.props['speaker'] === 'string' ? e.props['speaker'] : e.type)).filter((s) => speaks.has(s))));
  return {
    asked: wantsStory(idea),
    // Without a plan (a sample made by hand), a talk with people is rich, one told in narration alone light.
    depth: bible?.success ? bible.data.depth : talk ? (talk.starts.length > 0 ? 'rich' : 'light') : 'none',
    talk,
    levels: levels.length,
    placed: placed.size,
    mentions: talk ? storyMentions(talk, idea).length : 0,
  };
}
