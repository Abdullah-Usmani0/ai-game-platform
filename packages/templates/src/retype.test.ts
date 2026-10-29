/**
 * A game may call its entities anything: when the types a system names (the xp a kill drops, the crate a board pushes,
 * the relics a cave hides) are renamed in the definitions, the levels and that system's parameters, the game plays
 * exactly the same. The solver's inputs on the original replay on the renamed game to the same outcome. This is what
 * freeform rosters rely on.
 */
import type { LevelJson, ParamValue, SystemsJson } from '@gg/schemas';
import { createSim, type FeedbackBinding } from '@gg/sdk';
import { runBot, scriptFromLog, simOptionsFor, systemsJsonFor, type GenreManifest } from '@gg/template-core';
import { checkSystems } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { CATALOG, GENRES } from './node.js';

const CASES: Array<{ genre: string; renames: Record<string, string>; params: Record<string, Record<string, ParamValue>>; difficulty: number }> = [
  { genre: 'survivors', renames: { xp: 'nectar' }, params: { 'auto-attack': { dropType: 'nectar' } }, difficulty: 0.3 },
  { genre: 'topdown-action', renames: { gem: 'orb' }, params: { 'room-clear': { healType: 'orb' } }, difficulty: 0.5 },
  { genre: 'shmup', renames: { shot: 'spark' }, params: { 'player-shooter': { shotType: 'spark' } }, difficulty: 0.3 },
  { genre: 'puzzle', renames: { crate: 'barrel', target: 'mark' }, params: { 'grid-push': { crateType: 'barrel', targetType: 'mark' } }, difficulty: 0.5 },
  { genre: 'metroidvania', renames: { wings: 'cape', boots: 'greaves', key: 'sigil', door: 'gate' }, params: { relics: { doubleJumpRelic: 'cape', dashRelic: 'greaves', keyType: 'sigil', doorType: 'gate' } }, difficulty: 0.3 },
];
const EVENTS = ['hit', 'death', 'pickup', 'spawn', 'despawn', 'level_complete', 'checkpoint', 'push', 'move', 'feedback'];

function outcome(sim: ReturnType<typeof createSim>) {
  return { won: sim.world.flags.won, over: sim.world.flags.gameOver, tick: sim.tick, deaths: sim.world.deaths, score: sim.world.score, hp: sim.world.player.hp, events: Object.fromEntries(EVENTS.map((e) => [e, sim.events.count(e)])) };
}

function withParams(systems: SystemsJson, params: Record<string, Record<string, ParamValue>>): SystemsJson {
  return { ...systems, systems: systems.systems.map((s) => ({ ...s, params: { ...s.params, ...(params[s.id] ?? {}) } })) };
}

describe('renamed entity types play the same', () => {
  for (const c of CASES) {
    it(`${c.genre}: ${Object.entries(c.renames).map(([a, b]) => `${a} as ${b}`).join(', ')}`, () => {
      const g: GenreManifest = GENRES[c.genre]!;
      const params = { seed: 2, difficulty: c.difficulty };
      const level = g.levelGrammar.generate(params);
      const content = g.extraContent?.(params) ?? {};
      const feedback = [...g.gddDefaults.feedbackEvents, ...(g.feedbackExtras ?? [])] as FeedbackBinding[];
      const original = simOptionsFor(g, systemsJsonFor(g), { behaviours: g.defaultBehaviours, content, feedback });
      const sim = createSim({ ...original, level, seed: 1 });
      const r = runBot(sim, g.bots[g.solverBot]!, 90 * 60);
      expect(r.completed).toBe(true);
      const script = scriptFromLog(sim, sim.tick);

      const rename = (t: string) => c.renames[t] ?? t;
      const renamedLevel: LevelJson = { ...level, entities: level.entities.map((e) => ({ ...e, type: rename(e.type) })) };
      const renamed = { ...original, ...simOptionsFor(g, withParams(systemsJsonFor(g), c.params), { behaviours: g.defaultBehaviours, content, feedback }) };
      renamed.entityDefs = original.entityDefs.map((d) => ({ ...d, type: rename(d.type) }));
      const again = createSim({ ...renamed, level: renamedLevel, seed: 1 });
      again.run(script, sim.tick);
      expect(outcome(again)).toEqual(outcome(sim));
      expect(again.world.entities.some((e) => Object.keys(c.renames).includes(e.type))).toBe(false);
    });
  }

  it('the catalog keeps these names out of systems.json: only the composition may set them', () => {
    const g = GENRES['survivors']!;
    expect(systemsJsonFor(g).systems.find((s) => s.id === 'auto-attack')!.params).not.toHaveProperty('dropType');
    const set = withParams(systemsJsonFor(g), { 'auto-attack': { dropType: 'nectar' } });
    expect(checkSystems(set, CATALOG).issues.map((i) => i.code)).toEqual(['entity_param']);
    expect(checkSystems(withParams(systemsJsonFor(g), { 'auto-attack': { dropType: 'xp' } }), CATALOG).ok).toBe(true);
  });
});
