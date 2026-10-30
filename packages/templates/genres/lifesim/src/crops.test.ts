import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CropTable, type Crop, type SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { levelTicksOf, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { cropTableIssues, describeFarmRules, farmRulesFromSystems } from './crops.js';
import { CROPS_CONTENT, lifesim } from './node.js';
import { DEFAULT_CROPS } from './systems/farm-kit.js';

const SAMPLE = CropTable.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../../../../samples/lifesim/content/crops.json', import.meta.url)), 'utf8')));
const DEFAULTS: CropTable = { version: 1, crops: [...DEFAULT_CROPS] };
const [turnip, lettuce, tomato, corn] = DEFAULT_CROPS as [Crop, Crop, Crop, Crop];
const MOON: CropTable = {
  version: 1,
  crops: [
    { id: 'moonbulb', name: 'Moonbulb', seedPrice: 10, sellPrice: 30, growDays: 2, look: { shape: 'root', color: '#a9dcff' } },
    { id: 'starberry', name: 'Starberry', seedPrice: 45, sellPrice: 35, growDays: 4, regrowDays: 1, look: { shape: 'bush', color: '#ffd75e' } },
    { id: 'nightlily', name: 'Nightlily', seedPrice: 50, sellPrice: 175, growDays: 5, look: { shape: 'tall', color: '#c59bff' } },
  ],
};

/** The genre's systems with some parameters set and some left out, as a game's systems.json holds them. */
function systems(params: Record<string, Record<string, number>> = {}, without: string[] = []): SystemsJson {
  const s = systemsJsonFor(lifesim);
  return { ...s, systems: s.systems.filter((x) => !without.includes(x.id)).map((x) => ({ ...x, params: { ...x.params, ...params[x.id] } })) };
}
const codes = (t: CropTable, sys = systems()) => cropTableIssues(t, farmRulesFromSystems(sys)).map((i) => `${i.severity}:${i.code}`);
const table = (...crops: Crop[]): CropTable => ({ version: 1, crops });

describe('a crop table, for the rules of its game', () => {
  it('the default crops, the sample farm and a moon garden pass under the default rules', () => {
    expect(codes(DEFAULTS)).toEqual([]);
    expect(codes(SAMPLE)).toEqual([]);
    expect(codes(MOON)).toEqual([]);
  });

  it('reads the rules from systems.json: a selected system takes its defaults, one left out has no part', () => {
    expect(farmRulesFromSystems(systems())).toMatchObject({ days: 7, startGold: 100, starterSeeds: 6, packSize: 5, maxEnergy: 60, bed: true });
    expect(farmRulesFromSystems(systems({ season: { days: 4 } }, ['shop', 'energy']))).toMatchObject({ days: 4, packSize: null, maxEnergy: null });
    expect(describeFarmRules(farmRulesFromSystems(systems()))).toMatch(/season of 7 days.*100 gold.*6 seeds of the first crop.*packs of 5.*60 energy/);
  });

  it('nothing worth farming is an error: no crop that ripens, a season that earns next to nothing, a name twice', () => {
    expect(codes(table({ ...corn, growDays: 9 }, { ...lettuce, growDays: 7 }, { ...turnip, growDays: 8 }))).toContain('error:crops_unripe');
    expect(codes(table({ ...turnip, sellPrice: 11 }, { ...lettuce, sellPrice: 16 }, { ...corn, sellPrice: 41 }))).toContain('error:crops_barren');
    expect(codes(table(turnip, lettuce, { ...corn, name: 'turnip' }))).toContain('error:crop_name_twice');
    // No shop and no starter seeds: nothing can be sown at all.
    expect(codes(DEFAULTS, systems({ farming: { starterSeeds: 0 } }, ['shop']))).toContain('error:crops_barren');
  });

  it('a card no player should be shown is a warning, with the reason', () => {
    // In a four-day season tomatoes and corn never ripen.
    const short = cropTableIssues(DEFAULTS, farmRulesFromSystems(systems({ season: { days: 4 } })));
    expect(short.map((i) => i.message)).toEqual([expect.stringMatching(/^Tomato takes 4 days/), expect.stringMatching(/^Corn takes 5 days/)]);
    expect(short.every((i) => i.severity === 'warning' && i.code === 'crop_trap')).toBe(true);
    expect(codes(table(turnip, { ...lettuce, seedPrice: 12, sellPrice: 25, growDays: 3 }, corn))).toEqual(['warning:crop_dominated']);
    expect(codes(table(turnip, lettuce, { ...tomato, look: { shape: 'root', color: '#eedff0' } }))).toEqual(['warning:crop_lookalike']);
    expect(codes(table({ ...corn, growDays: 5 }, turnip, lettuce), systems({ season: { days: 5 } }))).toContain('warning:starter_unripe');
    expect(codes(table({ ...turnip, name: 'Moon melon XL' }, lettuce, corn))).toEqual(['warning:crop_name_long']);
    expect(codes(table({ ...turnip, seedPrice: 1, sellPrice: 2000, growDays: 1 }, lettuce, corn))).toContain('warning:crops_rich');
    expect(codes(table(turnip, corn))).toEqual(['warning:crops_few']);
    expect(codes(DEFAULTS, systems({}, ['shop']))).toEqual(['warning:crop_unsold']);
  });

  it('the design content checks the schema first, then the rules; its prompt states the rules', () => {
    expect(CROPS_CONTENT.check({ version: 1, crops: [] }, systems()).map((i) => i.code)).toEqual(['crops_schema']);
    expect(CROPS_CONTENT.check(CROPS_CONTENT.fallback, systems())).toEqual([]);
    expect(CROPS_CONTENT.check(SAMPLE, systems({ season: { days: 3 } })).map((i) => i.code)).toContain('crop_trap');
    expect(CROPS_CONTENT.rules(systems({}, ['shop']))).toMatch(/no seed shop/);
    expect(CROPS_CONTENT.score!(DEFAULTS)).toBeGreaterThan(CROPS_CONTENT.score!(table(turnip, lettuce, corn)));
  });
});

describe('the farmer proves seasons on crop tables the check accepts', () => {
  it('wins with the sample farm crops and the moon garden ones, at both ends of the ramp', () => {
    const sys = systemsJsonFor(lifesim);
    for (const crops of [SAMPLE, MOON]) {
      for (const difficulty of [0.2, 0.8]) {
        const level = lifesim.levelGrammar.generate({ seed: 3, difficulty });
        const options = simOptionsFor(lifesim, sys, { behaviours: lifesim.defaultBehaviours, content: { crops } });
        const r = runBot(createSim({ ...options, level, seed: 2 }), lifesim.bots[lifesim.solverBot]!, levelTicksOf(options));
        expect(r.completed, `${crops.crops[0]!.id} at difficulty ${difficulty}`).toBe(true);
      }
    }
  });
});
