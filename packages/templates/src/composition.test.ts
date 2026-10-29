/**
 * The composition rules against the real catalog: every curated genre's systems pass them (required ones alone, and with
 * every optional one), and mixing systems across genres without care fails for the reason a designer would name.
 */
import type { Objectives } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { objectives, objectivesMeta, rolesPresent } from '@gg/template-core';
import { checkComposition, deathSwitches, type CatalogSystem } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { CATALOG, GENRES } from './node.js';

// The objectives system belongs to no curated genre, so it is not in the catalog the genres build.
const metas = (ids: string[]): CatalogSystem[] => ids.map((id) => (id === objectivesMeta.id ? objectivesMeta : CATALOG[id]!));
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
    // A platformer that also runs the survival clock: two ways to win (hazards' respawn would yield to the clock's game over).
    expect(codes([...GENRES['platformer']!.requiredSystems, 'survival'], 'platformer')).toEqual(['two_wins']);
    // Clearing rooms against the clock: two ways to win, and two rules that end the run.
    expect(codes([...GENRES['topdown-action']!.requiredSystems, 'survival'], 'topdown-action')).toEqual(['two_death_rules', 'two_wins']);
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

  it("a platformer won by objectives: hazards' respawn yields to the objectives' lives", () => {
    const ids = ['movement-platformer', 'hazards', 'combat-stomp', 'pickups', 'objectives'];
    expect(codes(ids, 'platformer', ['objectives'])).toEqual([]);
    expect(deathSwitches(metas(ids))).toEqual({ hazards: { respawn: false } });
  });
});

describe('death rules in play', () => {
  it('with the respawn switched off, the objectives alone respawn the player, then end the run on the last life', () => {
    const g = GENRES['platformer']!;
    const rules: Objectives = { version: 1, win: { mode: 'all', clauses: [{ kind: 'reach_goal' }] }, lose: [{ kind: 'lives', count: 2 }] };
    const sim = createSim({
      level: g.levelGrammar.generate({ seed: 1, difficulty: 0.3 }),
      seed: 1,
      feel: g.feelPresets[g.defaultFeel]!,
      systems: [g.systems['movement-platformer']!.create(), g.systems['hazards']!.create(), objectives],
      entityDefs: g.entityDefs,
      player: g.player,
      behaviours: g.defaultBehaviours,
      movementMode: 'platformer',
      // Hazards would bring the player back after 10 ticks; the objectives wait 60.
      params: { hazards: { respawnDelayTicks: 10, ...deathSwitches(metas(['hazards', 'objectives']))['hazards'] }, objectives: { respawnDelayTicks: 60 } },
      content: { objectives: rules },
    });
    const deathTicks: number[] = [];
    const spawnTicks: number[] = [];
    sim.events.on('death', (ev) => void (ev.payload['type'] === 'player' && deathTicks.push(ev.tick)));
    sim.events.on('spawn', (ev) => void (ev.payload['type'] === 'player' && spawnTicks.push(ev.tick)));
    // Walking right without jumping meets the first pit, spikes or enemy, every life.
    for (let t = 0; t < 3000 && !sim.world.flags.gameOver; t++) sim.step({ left: false, right: true, up: false, down: false, jump: false, dash: false, action: false, pause: false });
    expect(sim.world.flags.gameOver).toBe(true);
    expect(deathTicks).toHaveLength(2);
    expect(spawnTicks).toEqual([deathTicks[0]! + 60]);
    for (let t = 0; t < 120; t++) sim.step({ left: false, right: false, up: false, down: false, jump: false, dash: false, action: false, pause: false });
    expect(sim.world.player.alive, 'no one brings the player back after the run ends').toBe(false);
  });
});
