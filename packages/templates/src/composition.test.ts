/**
 * The composition rules against the real catalog: every curated genre's systems pass them (required ones alone, and with
 * every optional one), and mixing systems across genres without care fails for the reason a designer would name.
 */
import { rolesPresent } from '@gg/template-core';
import { checkComposition, type CatalogSystem } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { CATALOG, GENRES } from './node.js';

const metas = (ids: string[]): CatalogSystem[] => ids.map((id) => CATALOG[id]!);
const contentOf = (id: string) => Object.keys(GENRES[id]!.extraContent?.({ seed: 1, difficulty: 0.3 }) ?? {});
const codes = (ids: string[], genre: string, content = contentOf(genre)) => checkComposition(metas(ids), { roles: rolesPresent(GENRES[genre]!), content }).issues.map((i) => i.code).sort();

describe('curated genres compose', () => {
  for (const g of Object.values(GENRES)) {
    it(`${g.id}: its required systems, and all of its systems, pass the composition rules`, () => {
      expect(codes(g.requiredSystems, g.id)).toEqual([]);
      expect(codes([...g.requiredSystems, ...g.optionalSystems], g.id)).toEqual([]);
    });
  }

  it('mixing across genres without care fails for the reason a designer would give', () => {
    // A platformer that also runs the survival clock: two ways to win, two death rules.
    expect(codes([...GENRES['platformer']!.requiredSystems, 'survival'], 'platformer')).toEqual(['two_death_rules', 'two_wins']);
    // Stomping needs platformer movement; a top-down arena has none.
    expect(codes([...GENRES['survivors']!.requiredSystems, 'combat-stomp'], 'survivors')).toEqual(['movement_mismatch']);
    // A sword and a gun on the same key.
    expect(codes([...GENRES['topdown-action']!.requiredSystems, 'player-shooter'], 'topdown-action')).toEqual(['key_twice']);
    // Waves with no waves to spawn.
    expect(codes(GENRES['survivors']!.requiredSystems, 'survivors', [])).toEqual(['missing_content']);
    // A clear-the-room rule in a game with nothing to fight.
    expect(codes(['movement-topdown', 'room-clear'], 'puzzle')).toEqual(['missing_role']);
    // Platformer and top-down movement at once.
    expect(codes(['movement-platformer', 'movement-topdown', 'goal', 'hazards'], 'platformer')).toContain('two_movements');
  });
});
