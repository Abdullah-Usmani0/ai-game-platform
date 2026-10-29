import type { EntityRoster, RosterEntry } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { IDENTITY_ROSTER } from './compose.js';
import { ARCHETYPES, CURATED_IDS, RUNTIMES } from './registry.js';
import { compileRoster } from './roster.js';

const roster = (types: Array<Omit<RosterEntry, 'hp'> & { hp?: number }>, player: EntityRoster['player'] = {}): EntityRoster => ({ version: 1, designNotes: '', player, types: types.map((t) => ({ hp: 1, ...t })) });
const byId = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

describe('compileRoster', () => {
  it("an empty roster is the base genre: its definitions, behaviours and names, exactly", () => {
    for (const g of CURATED_IDS) {
      const rt = RUNTIMES[g];
      const c = compileRoster(g, IDENTITY_ROSTER, [...rt.requiredSystems, ...rt.optionalSystems]);
      expect(c.issues, g).toEqual([]);
      expect(c.defs, g).toEqual(rt.entityDefs);
      const used = new Set(rt.entityDefs.map((d) => d.fsm));
      expect(byId(c.behaviours), g).toEqual(byId(rt.defaultBehaviours.filter((b) => used.has(b.id))));
      expect([...c.rename].filter(([a, b]) => a !== b), g).toEqual([]);
      expect(c.entityParams, g).toEqual({});
      expect(c.player, g).toEqual(rt.player);
    }
  });

  it('a renamed type keeps the shipped body, behaviour and art, its health scaled', () => {
    const c = compileRoster('survivors', roster([{ type: 'wasp', archetype: 'survivors:chaser' }, { type: 'hornet', archetype: 'survivors:brute', hp: 1.5 }], { hp: 9 }), ['movement-topdown', 'melee-attack', 'spawner', 'objectives']);
    expect(c.issues).toEqual([]);
    expect(c.defs.find((d) => d.type === 'wasp')).toEqual({ ...ARCHETYPES['survivors:chaser']!.def, type: 'wasp', drawAs: 'chaser' });
    expect(c.defs.find((d) => d.type === 'hornet')).toMatchObject({ hp: 9, drawAs: 'brute', fsm: 'chaser' });
    expect(c.defs.map((d) => d.type)).toEqual(['wasp', 'hornet', 'xp']);
    expect(c.rename).toEqual(new Map([['chaser', 'wasp'], ['brute', 'hornet'], ['xp', 'xp']]));
    expect(c.player.hp).toBe(9);
  });

  it('brings in what the systems spawn and what the behaviours fire, under the roster names', () => {
    // Top-down rooms with the survivors auto-attack: its drops come along, renamed; the archers fire renamed arrows.
    const c = compileRoster('topdown-action', roster([{ type: 'shard', archetype: 'survivors:xp' }, { type: 'dart', archetype: 'topdown-action:arrow' }]), ['movement-topdown', 'auto-attack', 'room-clear', 'pickups']);
    expect(c.issues).toEqual([]);
    expect(c.entityParams).toEqual({ 'auto-attack': { dropType: 'shard' } });
    expect(c.defs.find((d) => d.type === 'shard')).toMatchObject({ pickup: true, drawAs: 'xp' });
    expect(JSON.stringify(c.behaviours.find((b) => b.id === 'archer'))).toContain('"projectile":"dart"');
    expect(JSON.stringify(c.behaviours)).not.toContain('"projectile":"arrow"');
    // Unnamed, a needed entity keeps its own name.
    const plain = compileRoster('topdown-action', IDENTITY_ROSTER, ['movement-topdown', 'auto-attack', 'room-clear']);
    expect(plain.defs.map((d) => d.type)).toContain('xp');
    expect(plain.entityParams).toEqual({});
    // A top-down archer in a survivors arena brings its arrows.
    const arena = compileRoster('survivors', roster([{ type: 'sentry', archetype: 'topdown-action:archer' }]), ['movement-topdown', 'auto-attack', 'spawner', 'survival']);
    expect(arena.issues).toEqual([]);
    expect(arena.defs.map((d) => d.type)).toEqual(expect.arrayContaining(['sentry', 'arrow']));
  });

  it('runs each genre its own behaviour where two genres share a behaviour id', () => {
    const c = compileRoster('platformer', roster([{ type: 'snail', archetype: 'metroidvania:walker' }]), ['movement-platformer', 'hazards', 'goal']);
    expect(c.issues).toEqual([]);
    // The behaviour a type runs, its id set aside (shared, or kept apart as '<genre>-walker').
    const steps = (type: string) => ({ ...c.behaviours.find((b) => b.id === c.defs.find((d) => d.type === type)!.fsm)!, id: '' });
    expect(steps('snail')).toEqual({ ...ARCHETYPES['metroidvania:walker']!.behaviour!, id: '' });
    expect(steps('walker')).toEqual({ ...ARCHETYPES['platformer:walker']!.behaviour!, id: '' });
  });

  it('names what is wrong: an unknown entity, one from a game that moves otherwise, a name the game needs elsewhere', () => {
    const codes = (types: Parameters<typeof roster>[0], base: 'survivors' | 'platformer' = 'survivors') => compileRoster(base, roster(types), []).issues.map((i) => i.code);
    expect(codes([{ type: 'ghost', archetype: 'survivors:ghost' }])).toEqual(['unknown_archetype']);
    expect(codes([{ type: 'slug', archetype: 'platformer:walker' }])).toEqual(['archetype_movement']);
    // Naming the chaser 'brute' leaves the arena's own brute without a name of its own.
    expect(codes([{ type: 'brute', archetype: 'survivors:chaser' }])).toEqual(['type_taken']);
  });
});
