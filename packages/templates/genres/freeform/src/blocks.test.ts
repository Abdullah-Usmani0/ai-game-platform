import type { EntityRoster, FreeformSystemsJson, LevelJson, Objectives } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { blockBots, blockTypes } from './blocks.js';
import { compose } from './compose.js';
import { freeformManifest } from './node.js';
import { idleWins, proveLevel } from './prove.js';
import { ARCHETYPES, paramArchetype } from './registry.js';
import { compileRoster } from './roster.js';

const deliveries = (n: number, lives?: number): Objectives => ({ version: 1, win: { mode: 'all', clauses: [{ kind: 'hud_at_least', key: 'delivered', value: n }] }, lose: lives === undefined ? [] : [{ kind: 'lives', count: lives }] });
const survive = (seconds: number): Objectives => ({ version: 1, win: { mode: 'all', clauses: [{ kind: 'survive', seconds }] }, lose: [{ kind: 'lives', count: 3 }] });

/** A tea room on the survivors' arena: carry tea from the kitchen to the tables. */
const TEA: FreeformSystemsJson = {
  version: 1,
  genre: 'freeform',
  composition: { base: 'survivors' },
  feelPreset: 'arena-melee',
  systems: [
    { id: 'movement-topdown', params: {} },
    { id: 'carry', params: { dropoffs: 3 } },
    { id: 'objectives', params: {} },
  ],
};
const TEA_ROSTER: EntityRoster = {
  version: 1,
  designNotes: 'Tea from the kitchen to the tables.',
  player: {},
  types: [
    { type: 'teapot', archetype: 'carry:cargo', hp: 1 },
    { type: 'table', archetype: 'carry:dropoff', hp: 1 },
    { type: 'kitchen', archetype: 'carry:source', hp: 1 },
  ],
};
/** A lighthouse keeper's run, side view: oil from the cellar along the cliff path to the lamp. */
const OIL: FreeformSystemsJson = {
  version: 1,
  genre: 'freeform',
  composition: { base: 'platformer' },
  feelPreset: 'celeste-class',
  systems: [
    { id: 'movement-platformer', params: {} },
    { id: 'carry', params: { dropoffs: 1 } },
    { id: 'objectives', params: {} },
  ],
};

describe('blocks bring their own entities', () => {
  it('a block entity is an archetype of its own, named for the block, and a system parameter finds it first', () => {
    expect(ARCHETYPES['carry:cargo']).toMatchObject({ genre: null, block: 'carry', roles: ['cargo'] });
    expect(paramArchetype('carry', 'dropoff')).toBe('carry:dropoff');
  });

  it("a roster renames them like any shipped entity, and the courier's parameters follow the names", () => {
    const r = compileRoster('survivors', TEA_ROSTER, TEA.systems.map((s) => s.id));
    expect(r.issues).toEqual([]);
    expect(r.entityParams['carry']).toEqual({ cargoType: 'teapot', sourceType: 'kitchen', dropoffType: 'table' });
    expect(r.roles['table']).toEqual(['dropoff']);
    expect(r.defs.find((d) => d.type === 'teapot')).toMatchObject({ w: 6, h: 6, drawAs: 'cargo' });
  });

  it('they work whatever way the player moves, and only with their block', () => {
    expect(compileRoster('platformer', TEA_ROSTER, OIL.systems.map((s) => s.id)).issues).toEqual([]);
    expect(compileRoster('survivors', TEA_ROSTER, ['movement-topdown', 'objectives']).issues.map((i) => i.code)).toEqual(['archetype_block', 'archetype_block', 'archetype_block']);
  });

  it("the game binds the block's own events' feedback", () => {
    const events = compose(TEA, TEA_ROSTER).runtime.feedbackExtras?.map((x) => x.event);
    expect(events).toEqual(expect.arrayContaining(['custom:lift', 'custom:deliver', 'custom:drop', 'custom:no_order', 'custom:not_ready']));
  });
});

describe('a carry game', () => {
  const teaRoom = (seed: number) => freeformManifest(TEA, TEA_ROSTER).levelGrammar.generate({ seed, difficulty: 0.3 });

  it("top-down: the base genre's arena with the kitchen and three tables placed on it, which the check accepts", () => {
    const m = freeformManifest(TEA, TEA_ROSTER);
    const level = teaRoom(1);
    expect(level.entities.filter((e) => e.type === 'kitchen')).toHaveLength(1);
    expect(level.entities.filter((e) => e.type === 'table')).toHaveLength(3);
    const feel = m.feelPresets[TEA.feelPreset]!;
    expect(m.levelGrammar.validate(level, feel).issues.filter((i) => i.severity === 'error')).toEqual([]);
    // A table moved off its solid ground is the block's problem, said in its words.
    const moved: LevelJson = { ...level, entities: level.entities.map((e) => (e.type === 'table' ? { ...e, x: e.x + 1 } : e)) };
    expect(m.levelGrammar.validate(moved, feel).issues.map((i) => i.code)).toContain('station_not_solid');
    expect([...blockTypes(TEA, compose(TEA, TEA_ROSTER))].sort()).toEqual(['kitchen', 'table', 'teapot']);
  });

  it('the courier proves it: its bot plays the job before the explorer is tried', () => {
    expect(Object.keys(blockBots(TEA))).toEqual(['courier']);
    const level = { ...teaRoom(1), id: 'arena' };
    const r = proveLevel(level, 0, { file: TEA, roster: TEA_ROSTER, content: { objectives: deliveries(5) }, budget: 20_000 });
    expect(r.proof, r.tried.join('; ')).not.toBeNull();
    expect(r.proof!.by).toBe('bot');
    expect(r.tried.at(-1)).toMatch(/^courier: wins in \d+ ticks$/);
    // The run replays as the stored proof it now is.
    expect(proveLevel(level, 0, { file: TEA, roster: TEA_ROSTER, content: { objectives: deliveries(5) }, budget: 20_000 }, r.proof!).tried).toEqual(['stored proof: wins']);
  });

  it('side view: a cellar near the start and the lamp further along the path, reachable both ways; the courier proves it', () => {
    const m = freeformManifest(OIL);
    const level = { ...m.levelGrammar.generate({ seed: 2, difficulty: 0.2 }), id: 'l01' };
    const source = level.entities.find((e) => e.type === 'source');
    const lamp = level.entities.find((e) => e.type === 'dropoff');
    expect(source, 'a source').toBeDefined();
    expect(lamp!.x - source!.x).toBeGreaterThanOrEqual(8);
    expect(m.levelGrammar.validate(level, m.feelPresets[OIL.feelPreset]!).issues.filter((i) => i.severity === 'error')).toEqual([]);
    const r = proveLevel(level, 0, { file: OIL, roster: { version: 1, designNotes: '', player: {}, types: [] }, content: { objectives: deliveries(2) }, budget: 20_000 });
    expect(r.proof, r.tried.join('; ')).not.toBeNull();
  });
});

/** The tea room at rush hour: four tables order in turn, and a waiter with three hearts can lose three customers. */
const RUSH: FreeformSystemsJson = {
  ...TEA,
  systems: [
    { id: 'movement-topdown', params: {} },
    { id: 'carry', params: { dropoffs: 4 } },
    { id: 'orders', params: {} },
    { id: 'objectives', params: {} },
  ],
};
/** The lighthouse at night: the lamp asks for oil every so often along a path of pits and walkers, and going out costs a life. */
const NIGHT: FreeformSystemsJson = {
  ...OIL,
  systems: [
    { id: 'movement-platformer', params: {} },
    { id: 'hazards', params: {} },
    { id: 'combat-stomp', params: {} },
    { id: 'carry', params: { dropoffs: 1 } },
    { id: 'orders', params: { patienceS: 20, everyS: 10, maxOpen: 1, missDamage: 3 } },
    { id: 'objectives', params: {} },
  ],
};
const THREE_HEARTS: EntityRoster = { version: 1, designNotes: '', player: { hp: 3 }, types: [] };

describe('timed orders', () => {
  it('top-down: the courier serves twelve before three walk out, walking at its own size round the tables; standing still loses', () => {
    const roster = { ...TEA_ROSTER, player: { hp: 3 } };
    const m = freeformManifest(RUSH, roster);
    // A waiter a little taller than a tile, who would wedge on a table's corner walking tile by tile.
    const level = { ...m.levelGrammar.generate({ seed: 1, difficulty: 0.3 }), id: 'arena', ramp: { segment: 0, difficulty: 0.3 } };
    const inputs = { file: RUSH, roster, content: { objectives: deliveries(12, 1) }, budget: 20_000 };
    const r = proveLevel(level, 0, inputs);
    expect(r.proof?.by, r.tried.join('; ')).toBe('bot');
    expect(idleWins(level, 0, inputs, r.proof!.ticks)).toBe(false);
  });

  it('side view: the courier keeps the lamp lit, hopping pits in a row and landing short of the next after a stomp', () => {
    const m = freeformManifest(NIGHT, THREE_HEARTS);
    for (const [seed, difficulty] of [
      [3, 0.5],
      [19, 0.6],
    ] as const) {
      const level = { ...m.levelGrammar.generate({ seed, difficulty }), id: 'l01', ramp: { segment: 0, difficulty } };
      const inputs = { file: NIGHT, roster: THREE_HEARTS, content: { objectives: survive(75) }, budget: 20_000 };
      const r = proveLevel(level, 0, inputs);
      expect(r.proof?.by, `seed ${seed}: ${r.tried.join('; ')}`).toBe('bot');
      // Three walkouts put the lamp out three times before the night is over.
      expect(idleWins(level, 0, inputs, r.proof!.ticks)).toBe(false);
    }
  });
});
