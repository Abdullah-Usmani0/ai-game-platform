import type { BehaviourFsm, LevelJson } from '@gg/schemas';
import { GENRES } from '@gg/templates/node';
import { describe, expect, it } from 'vitest';
import { CASTLE_RUBRIC, grade, measure, type RubricInputs } from './rubric.js';

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
    const v = measure({ genre: 'castle', entityDefs: castle.entityDefs, player: castle.player, behaviours: castle.defaultBehaviours, levels: [region], assets: [] });
    expect(v).toMatchObject({ hero_height: 42, hero_clips: 9, parallax_layers: 3, ability_gates: 2 });
    expect(v['rooms']).toBeGreaterThanOrEqual(12);
    expect(v['altar_spacing']).toBeLessThanOrEqual(4);
    const g = grade(CASTLE_RUBRIC, v);
    for (const id of ['hero_height', 'rooms', 'ability_gates', 'altar_spacing', 'parallax_layers']) expect(g.results.find((r) => r.id === id)?.pass, id).toBe(true);
  });

  it('holds a ceiling line to at most its target', () => {
    const g = grade([{ id: 'altar_spacing', area: 'world', text: '', target: 4, most: true }], { altar_spacing: 5 });
    expect(g.results[0]!.pass).toBe(false);
    expect(grade([{ id: 'altar_spacing', area: 'world', text: '', target: 4, most: true }], { altar_spacing: 3 }).results[0]!.pass).toBe(true);
  });
});
