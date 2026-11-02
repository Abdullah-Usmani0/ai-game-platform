import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DialogueFile, MoveSet, type BehaviourFsm, type LevelJson } from '@gg/schemas';
import { levelPlan } from '@gg/template-core';
import { EXAMPLES, GENRES, resolveGame } from '@gg/templates/node';
import { draftStory, storyMentions } from '@gg/worker-generator';
import { describe, expect, it } from 'vitest';
import { CASTLE_RUBRIC, grade, measure, measureStory, rubricInputsOf, storyInputsOf, STORY_RUBRIC, type RubricInputs } from './rubric.js';

const mv = GENRES['metroidvania']!;
const caverns = [{}, {}, {}] as unknown as LevelJson[];
const today: RubricInputs = { genre: 'metroidvania', entityDefs: mv.entityDefs, player: mv.player, behaviours: mv.defaultBehaviours, levels: caverns, assets: [] };

/** A boss that winds up for 200 ms before a slam and turns twice as it weakens. */
const abbot = {
  version: 1,
  id: 'abbot',
  designNotes: '',
  initial: 'pace',
  states: {
    pace: { onEnter: [], update: [], transitions: [{ to: 'windup', when: { kind: 'timer_elapsed', ms: 900 } }, { to: 'wrath', when: { kind: 'hp_below', fraction: 0.6 } }] },
    windup: { onEnter: [{ kind: 'play_anim', anim: 'windup' }], update: [], transitions: [{ to: 'slam', when: { kind: 'timer_elapsed', ms: 200 } }] },
    slam: { onEnter: [{ kind: 'damage_player', amount: 1, radius: 24 }], update: [], transitions: [{ to: 'pace', when: { kind: 'always' } }] },
    wrath: { onEnter: [], update: [], transitions: [{ to: 'windup', when: { kind: 'timer_elapsed', ms: 400 } }, { to: 'last', when: { kind: 'hp_below', fraction: 0.25 } }] },
    last: { onEnter: [], update: [], transitions: [{ to: 'windup', when: { kind: 'timer_elapsed', ms: 250 } }] },
  },
} as unknown as BehaviourFsm;

describe('the castle rubric', () => {
  it("measures today's metroidvania as it is: an 11 px hero, three caverns, no boss, no one to talk to, one ending", () => {
    const v = measure(today);
    expect(v).toMatchObject({ hero_height: 11, rooms: 3, boss_phases: 0, npcs: 0, endings: 1, music_cues: 0, parallax_layers: 3, ability_gates: null });
    const g = grade(CASTLE_RUBRIC, v);
    expect(g.total).toBe(CASTLE_RUBRIC.length);
    const pass = (id: string) => g.results.find((r) => r.id === id)?.pass;
    expect(pass('parallax_layers')).toBe(true);
    expect(pass('hero_height')).toBe(false);
    expect(pass('boss_phases')).toBe(false);
    expect(pass('shortcut_loops')).toBeNull();
    expect(g.measured).toBeLessThan(g.total);
  });

  it('passes what a game shows: telegraphed hits, a boss with phases, rooms, backdrops, people to talk to, endings, music', () => {
    const v = measure({
      ...today,
      entityDefs: [...mv.entityDefs, { type: 'abbot', w: 24, h: 40, hp: 30, fsm: 'abbot', boss: true }, ...['nun', 'bellmaker', 'pilgrim', 'gravedigger'].map((type) => ({ type, w: 10, h: 20, npc: true }))],
      behaviours: [abbot],
      levels: [{ rooms: Array.from({ length: 14 }, () => ({})) } as unknown as LevelJson],
      assets: [{ kind: 'backdrop' }, { kind: 'backdrop' }, { kind: 'music' }, { kind: 'music' }],
      endings: 2,
    });
    expect(v).toMatchObject({ telegraph_ms: 200, boss_phases: 3, rooms: 14, parallax_layers: 5, npcs: 4, endings: 2, music_cues: 2 });
    const g = grade(CASTLE_RUBRIC, v);
    for (const id of ['telegraph_ms', 'boss_phases', 'rooms', 'parallax_layers', 'npcs', 'endings', 'music_cues']) expect(g.results.find((r) => r.id === id)?.pass, id).toBe(true);
  });

  it('measures the castle tier by its own hero and halls: the knight rig, a region of rooms, three layers behind the play', () => {
    const castle = GENRES['castle']!;
    const region = castle.levelGrammar.generate({ seed: 1, difficulty: 0.5 });
    const moves = MoveSet.parse(castle.shippedContent!['moves']).moves;
    const v = measure({ genre: 'castle', entityDefs: castle.entityDefs, player: castle.player, behaviours: castle.defaultBehaviours, levels: [region], assets: [], moves });
    // The knight's clips: idle, run, the chain's three, jump, fall, dash, hurt, the air cut, the plunge, the parry, the
    // riposte and the flask. The headsman roars at half health: two phases. The ghoul's claw is the quickest blow.
    expect(v).toMatchObject({ hero_height: 42, hero_clips: 14, parallax_layers: 3, ability_gates: 2, shortcut_loops: 1, boss_phases: 2, telegraph_ms: 300, idle_loses: 1 });
    expect(v['rooms']).toBeGreaterThanOrEqual(12);
    expect(v['altar_spacing']).toBeLessThanOrEqual(4);
    const g = grade(CASTLE_RUBRIC, v);
    for (const id of ['hero_height', 'hero_clips', 'telegraph_ms', 'boss_phases', 'rooms', 'ability_gates', 'shortcut_loops', 'altar_spacing', 'parallax_layers', 'idle_loses']) expect(g.results.find((r) => r.id === id)?.pass, id).toBe(true);
    // It stands through the whole region, as long as the game lets a level last: slow on a busy machine.
  }, 60_000);

  it("counts a game's endings from its story: the castle sample's three", () => {
    const inputs = rubricInputsOf(fileURLToPath(new URL('../../../samples/castle', import.meta.url)));
    expect(inputs.endings).toBe(3);
    expect(grade(CASTLE_RUBRIC.filter((l) => l.id === 'endings'), { endings: inputs.endings ?? null }).passed).toBe(1);
  });

  it('holds a ceiling line to at most its target', () => {
    const g = grade([{ id: 'altar_spacing', area: 'world', text: '', target: 4, most: true }], { altar_spacing: 5 });
    expect(g.results[0]!.pass).toBe(false);
    expect(grade([{ id: 'altar_spacing', area: 'world', text: '', target: 4, most: true }], { altar_spacing: 3 }).results[0]!.pass).toBe(true);
  });
});

describe('the story bar', () => {
  const castleDir = fileURLToPath(new URL('../../../samples/castle', import.meta.url));
  const lines = (g: ReturnType<typeof grade>) => Object.fromEntries(g.results.map((r) => [r.id, r.pass]));

  it("passes the castle sample's story whole: its two people placed, three endings, a quest, a prologue, nothing borrowed", () => {
    const s = storyInputsOf(castleDir, 'The legend of a bell-ringer in a drowned abbey.');
    expect([s.asked, s.depth, s.levels, s.placed, s.mentions]).toEqual([true, 'rich', 1, 2, 0]);
    const g = grade(STORY_RUBRIC, measureStory(s));
    expect([g.passed, g.total]).toEqual([STORY_RUBRIC.length, STORY_RUBRIC.length]);
  });

  it("passes the lost dog's: four villagers standing in its two woods, two endings, its quest", () => {
    const LOSTDOG = EXAMPLES.find((e) => e.id === 'lostdog')!;
    const story = DialogueFile.parse(LOSTDOG.content!['dialogue']);
    const dir = mkdtempSync(join(tmpdir(), 'gg-story-bar-'));
    try {
      const write = (rel: string, v: unknown) => {
        mkdirSync(join(dir, rel, '..'), { recursive: true });
        writeFileSync(join(dir, rel), typeof v === 'string' ? v : JSON.stringify(v));
      };
      write('design/systems.json', LOSTDOG.systems);
      write('design/gdd.md', `---\n${JSON.stringify(LOSTDOG.gdd)}\n---\n## Concept\nx\n`);
      write('content/entities.json', LOSTDOG.roster);
      write('content/dialogue.json', story);
      // Its levels as the levels stage makes them: through the seam, with the people its talk places.
      const m = resolveGame(dir);
      for (const slot of levelPlan(m.levelGrammar.kind, { levels: 2, bosses: 0, tier: 'small' })) write(`content/levels/L0${slot.index + 1}-${slot.id}.json`, { ...m.levelGrammar.generate({ seed: slot.seed, difficulty: slot.difficulty, level: slot.index }), id: slot.id });
      const s = storyInputsOf(dir, LOSTDOG.prompt);
      expect([s.asked, s.depth, s.levels, s.placed]).toEqual([true, 'rich', 2, 4]);
      expect(lines(grade(STORY_RUBRIC, measureStory(s)))).toEqual(Object.fromEntries(STORY_RUBRIC.map((l) => [l.id, true])));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("grades a light story on what a light story is: a chapter for each level, a prologue, an ending; the rich lines are left out", () => {
    const g = GENRES['platformer']!;
    const gdd = { title: 'The Long Climb', pillars: ['the climb', 'the bell', 'the dawn'] } as never;
    const drafted = draftStory({ genre: g, gdd, levels: 3, idea: 'the tale of a climb' });
    const v = measureStory({ asked: true, depth: drafted.bible.depth, talk: drafted.dialogue, levels: 3, placed: 0, mentions: 0 });
    expect(lines(grade(STORY_RUBRIC, v))).toEqual({ story_told: true, chapters: true, prologue: true, story_ends: true, clean_text: true });
    // A chapter short, and no epilogue: both missed.
    const short = { ...drafted.dialogue!, chapters: drafted.dialogue!.chapters!.slice(0, 2), endings: [] };
    expect(lines(grade(STORY_RUBRIC, measureStory({ asked: true, depth: 'light', talk: short, levels: 3, placed: 0, mentions: 0 })))).toMatchObject({ chapters: false, story_ends: false, prologue: true });
  });

  it('has nothing to grade where no story is asked or told, fails an idea that asked for one and got none, and a story naming another work', () => {
    expect(grade(STORY_RUBRIC, measureStory({ asked: false, depth: 'none', talk: null, levels: 2, placed: 0, mentions: 0 })).total).toBe(0);
    expect(lines(grade(STORY_RUBRIC, measureStory({ asked: true, depth: 'none', talk: null, levels: 2, placed: 0, mentions: 0 })))).toEqual({ story_told: false });
    // A rich story with one person and one ending falls short on both.
    const castle = DialogueFile.parse(GENRES['castle']!.shippedContent!['dialogue']);
    const thin = { ...castle, endings: castle.endings!.slice(-1) };
    expect(lines(grade(STORY_RUBRIC, measureStory({ asked: false, depth: 'rich', talk: thin, levels: 1, placed: 1, mentions: 0 })))).toMatchObject({ rich_endings: false, people_met: false, quest: true });
    // Words from the work the idea cites are caught.
    const borrowed = { ...castle, nodes: castle.nodes.map((n, i) => (i === 0 ? { ...n, lines: ['They say the climb is like Celeste.'] } : n)) };
    const s = storyMentions(borrowed, 'A climbing tale like Celeste');
    expect(s.length).toBeGreaterThan(0);
    expect(lines(grade(STORY_RUBRIC, measureStory({ asked: true, depth: 'rich', talk: borrowed, levels: 1, placed: 2, mentions: s.length })))).toMatchObject({ clean_text: false });
  });
});
