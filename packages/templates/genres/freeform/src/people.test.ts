import { DialogueFile, type FreeformBase, type FreeformSystemsJson, type LevelJson } from '@gg/schemas';
import { createSim, emptyInput, Tilemap } from '@gg/sdk';
import { levelPlan, rolesPresent, simOptionsFor } from '@gg/template-core';
import { checkComposition, checkSystems } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { levelIndexOf } from './blocks.js';
import { BASE_MANIFESTS, freeformManifest } from './node.js';
import { FREEFORM_CATALOG, RUNTIMES } from './registry.js';

/** Who stands where: a baker by the start of level 1, a smith partway, a shepherd near its end, a child in level 2. */
const STORY = DialogueFile.parse({
  version: 1,
  names: { baker: 'Wren', smith: 'Brann', shepherd: 'Old Tam', child: 'Pip' },
  nodes: [
    { id: 'flour', speaker: 'baker', lines: ['Mind the step.'] },
    { id: 'iron', speaker: 'smith', lines: ['Hot work.'] },
    { id: 'flock', speaker: 'shepherd', lines: ['The hill is steep.'] },
    { id: 'game', speaker: 'child', lines: ['Tag!'] },
  ],
  starts: [
    { speaker: 'baker', node: 'flour' },
    { speaker: 'smith', node: 'iron' },
    { speaker: 'shepherd', node: 'flock' },
    { speaker: 'child', node: 'game' },
  ],
  people: [
    { speaker: 'baker', level: 1, near: 'start' },
    { speaker: 'smith', level: 1, near: 'middle' },
    { speaker: 'shepherd', level: 1, near: 'end' },
    { speaker: 'child', level: 2, look: 3 },
  ],
});

/** The key each base leaves free to talk with: up in a side view; top-down, jump, or dash on a farm (its action works the soil). */
const KEYS: Partial<Record<FreeformBase, string>> = { platformer: 'up', metroidvania: 'up', survivors: 'jump', 'topdown-action': 'jump', lifesim: 'dash', shmup: 'jump' };
const BASES = Object.keys(KEYS) as FreeformBase[];

/** A base genre's own systems, with people to talk to on its free key (a farm's dash is off, as the farm genre has it). */
function withPeople(base: FreeformBase, key = KEYS[base]!): FreeformSystemsJson {
  const own = (id: string): Record<string, boolean> => (base === 'lifesim' && id === 'movement-topdown' ? { dash: false } : {});
  return { version: 1, genre: 'freeform', composition: { base }, feelPreset: BASE_MANIFESTS[base].defaultFeel, systems: [...RUNTIMES[base].requiredSystems.map((id) => ({ id, params: own(id) })), { id: 'talk', params: { key } }] };
}
const errors = (r: { issues: ReadonlyArray<{ severity: string; code: string }> }) => r.issues.filter((i) => i.severity === 'error').map((i) => i.code);
const composes = (file: FreeformSystemsJson) => {
  const m = freeformManifest(file);
  return errors(checkComposition(Object.values(m.systems).map((s) => s.meta), { roles: rolesPresent(m), content: ['waves', 'objectives', 'dialogue'], params: Object.fromEntries(file.systems.map((s) => [s.id, s.params])) }));
};
const peopleIn = (level: LevelJson) => level.entities.filter((e) => e.type === 'person');

describe('people on every base', () => {
  for (const base of BASES) {
    it(`${base}: the talk takes the key its movement leaves free, and each level gets the people its story places, where they can be met`, () => {
      const file = withPeople(base);
      expect(composes(file), base).toEqual([]);
      const m = freeformManifest(file, undefined, [], STORY);
      const plain = freeformManifest(file);
      const feel = m.feelPresets[m.defaultFeel]!;
      for (const slot of levelPlan(m.levelGrammar.kind, { levels: 2, bosses: 0, tier: 'small' })) {
        const params = { seed: slot.seed, difficulty: slot.difficulty, level: slot.index };
        const id = m.levelGrammar.kind === 'arena' ? 'arena' : slot.id;
        const level = { ...m.levelGrammar.generate(params), id };
        const want = (STORY.people ?? []).filter((p) => p.level === slot.index + 1).map((p) => p.speaker);
        expect(peopleIn(level).map((e) => e.props['speaker']).sort(), `${base} ${id}`).toEqual([...want].sort());
        // Each wears a look, and stands where the check says they can be met: no error the level without them lacks.
        for (const e of peopleIn(level)) expect(typeof e.props['look']).toBe('number');
        const without = { ...plain.levelGrammar.generate(params), id };
        expect(errors(m.levelGrammar.validate(level, feel)), `${base} ${id}`).toEqual(errors(plain.levelGrammar.validate(without, feel)));
        // Top-down, a person stands on a solid tile of their own; in a side view, on ground the player walks.
        const map = new Tilemap(level);
        for (const e of peopleIn(level)) expect(map.kindAt(e.x, e.y), `${base} ${String(e.props['speaker'])}`).toBe(m.movementMode === 'topdown' ? 'solid' : 'air');
      }
    });
  }

  it('places them in story order along the way: the one near the start nearer the spawn than the one near the end', () => {
    for (const base of BASES) {
      const m = freeformManifest(withPeople(base), undefined, [], STORY);
      const level = m.levelGrammar.generate({ seed: 7, difficulty: 0.3, level: 0 });
      const at = (s: string) => peopleIn(level).find((e) => e.props['speaker'] === s)!;
      const far = (s: string) => Math.abs(at(s).x - level.spawn.x) + Math.abs(at(s).y - level.spawn.y);
      expect(far('baker'), base).toBeLessThan(far('shepherd'));
    }
  });

  it('is the same level for the same seed, and leaves a level nobody is placed in as the game without the talk makes it', () => {
    const file = withPeople('topdown-action');
    const m = freeformManifest(file, undefined, [], STORY);
    expect(m.levelGrammar.generate({ seed: 3, difficulty: 0.3, level: 0 })).toEqual(m.levelGrammar.generate({ seed: 3, difficulty: 0.3, level: 0 }));
    const noTalk: FreeformSystemsJson = { ...file, systems: file.systems.filter((s) => s.id !== 'talk') };
    // Level 3 places nobody; nor does a game with no story.
    expect(m.levelGrammar.generate({ seed: 3, difficulty: 0.3, level: 2 })).toEqual(freeformManifest(noTalk).levelGrammar.generate({ seed: 3, difficulty: 0.3, level: 2 }));
    expect(freeformManifest(file).levelGrammar.generate({ seed: 3, difficulty: 0.3, level: 0 })).toEqual(freeformManifest(noTalk).levelGrammar.generate({ seed: 3, difficulty: 0.3, level: 0 }));
  });

  it('the check finds someone missing, walled in or unplaced by the story', () => {
    for (const base of ['platformer', 'topdown-action'] as const) {
      const m = freeformManifest(withPeople(base), undefined, [], STORY);
      const feel = m.feelPresets[m.defaultFeel]!;
      const level = { ...m.levelGrammar.generate({ seed: 4, difficulty: 0.3, level: 0 }), id: 'l01' };
      const codes = (l: LevelJson) => m.levelGrammar.validate(l, feel).issues.map((i) => i.code);
      expect(codes(level).filter((c) => c.startsWith('person'))).toEqual([]);
      // The smith gone: their talk is never heard.
      expect(codes({ ...level, entities: level.entities.filter((e) => e.props['speaker'] !== 'smith') })).toContain('person_missing');
      // The baker moved into the rock in the level's bottom corner.
      const buried = { ...level, entities: level.entities.map((e) => (e.props['speaker'] === 'baker' ? { ...e, x: 0, y: level.rows.length - 1 } : e)) };
      expect(codes(buried), base).toContain('person_unreachable');
      // In the second level, the story places only the child: anyone else is a stray.
      expect(m.levelGrammar.validate({ ...level, id: 'l02' }, feel).issues.filter((i) => i.code.startsWith('person')).map((i) => `${i.severity}:${i.code}`)).toEqual(expect.arrayContaining(['error:person_missing', 'warning:person_stray']));
    }
    expect([levelIndexOf('l01'), levelIndexOf('l10'), levelIndexOf('arena'), levelIndexOf('custom')]).toEqual([0, 9, 0, undefined]);
  });

  it('holds the key to the movement: no arrow top-down, no jump in a side view, and never a key another system uses', () => {
    const issues = (file: FreeformSystemsJson) => checkSystems(file, FREEFORM_CATALOG).issues.map((i) => i.code);
    expect(issues(withPeople('topdown-action', 'up'))).toContain('param_movement');
    expect(issues(withPeople('platformer', 'jump'))).toContain('param_movement');
    expect(issues({ ...withPeople('survivors'), systems: withPeople('survivors').systems.map((s) => (s.id === 'talk' ? { ...s, params: {} } : s)) })).toContain('param_movement');
    // The blade swings on action: a talk there would clash with it.
    expect(composes(withPeople('topdown-action', 'action'))).toContain('key_twice');
  });
});

describe('a person in play', () => {
  it("top-down: walked up to and spoken to on the game's key, they answer as the speaker the story placed", () => {
    const file = withPeople('topdown-action');
    const m = freeformManifest(file, undefined, [], STORY);
    const level = { ...m.levelGrammar.generate({ seed: 5, difficulty: 0.2, level: 0 }), id: 'l01' };
    const sim = createSim({ ...simOptionsFor(m, file, { content: { dialogue: STORY } }), level, seed: 1 });
    const baker = sim.world.entities.find((e) => e.props['speaker'] === 'baker')!;
    const p = sim.world.player;
    // Stood just below the baker's tile, then a press of jump.
    p.x = baker.x + baker.w / 2 - p.w / 2;
    p.y = baker.y + baker.h + 1;
    const talks: string[] = [];
    sim.events.on('custom:talk', (ev) => talks.push(String(ev.payload['speaker'])));
    sim.step(emptyInput());
    sim.step(emptyInput());
    sim.step({ ...emptyInput(), jump: true });
    expect(talks).toEqual(['baker']);
    expect(sim.world.dialogue?.node).toBe('flour');
  });
});
