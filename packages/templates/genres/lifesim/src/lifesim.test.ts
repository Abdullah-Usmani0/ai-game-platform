import type { Crop, LevelJson } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed } from '@gg/sdk';
import { levelPlan, levelTicksOf, runBot, scriptFromLog, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { fieldPlots, generateFarm, lifesim, validateFarm } from './node.js';
import { DEFAULT_CROPS, farmRules, idealSeason, packToBuy, seasonQuota, seedToSow, seedValue } from './index.js';

const crop = (id: string) => DEFAULT_CROPS.find((c) => c.id === id)!;
const options = (params: Record<string, Record<string, number>> = {}) => {
  const file = systemsJsonFor(lifesim);
  return simOptionsFor(lifesim, { ...file, systems: file.systems.map((s) => ({ ...s, params: { ...s.params, ...params[s.id] } })) });
};
const codes = (level: LevelJson) => validateFarm(level).issues.map((i) => i.code);

describe('farm grammar', () => {
  it('lays out a valid farm for every seed and difficulty, the same farm for the same seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of [0, 0.15, 0.45, 0.75, 1]) {
        const level = generateFarm({ seed, difficulty: d });
        expect(validateFarm(level).issues, `seed ${seed} difficulty ${d}`).toEqual([]);
      }
    }
    expect(JSON.stringify(generateFarm({ seed: 9, difficulty: 0.4 }))).toBe(JSON.stringify(generateFarm({ seed: 9, difficulty: 0.4 })));
  });

  it('grows the field with difficulty, and keeps an easy one near the house', () => {
    const plots = (d: number) => generateFarm({ seed: 3, difficulty: d }).entities.filter((e) => e.type === 'plot').length;
    expect(plots(0.15)).toBeLessThan(plots(0.45));
    expect(plots(0.45)).toBeLessThan(plots(0.75));
    expect(plots(1)).toBeLessThanOrEqual(fieldPlots(1));
    const walk = (d: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 20; seed++) sum += Number(validateFarm(generateFarm({ seed, difficulty: d })).metrics['walkToField']);
      return sum / 20;
    };
    expect(walk(0.15)).toBeLessThan(walk(0.75));
  });

  it('rejects a farm with a gap in the fence, a plot in a wall or out of reach, nothing to ship into, or two things on a tile', () => {
    const good = generateFarm({ seed: 5, difficulty: 0.3 });
    const rows = good.rows.map((r) => r.split(''));
    const plot = good.entities.find((e) => e.type === 'plot')!;
    const open = structuredClone(good);
    open.rows[0] = `.${good.rows[0]!.slice(1)}`;
    expect(codes(open)).toContain('farm_open');
    const walled = structuredClone(good);
    walled.rows[plot.y] = rows[plot.y]!.map((c, x) => (x === plot.x ? '#' : c)).join('');
    expect(codes(walled)).toContain('plot_in_wall');
    // A plot fenced in on all four sides.
    const fenced = structuredClone(good);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) fenced.rows[plot.y + dy] = fenced.rows[plot.y + dy]!.split('').map((c, x) => (x === plot.x + dx ? '#' : c)).join('');
    expect(codes(fenced)).toContain('plot_unreachable');
    expect(codes({ ...good, entities: good.entities.filter((e) => e.type !== 'bin') })).toContain('bin_missing');
    expect(codes({ ...good, entities: [...good.entities, { ...plot }] })).toContain('overlap');
    // A buyer asking for more than an ideal season earns.
    const greedy = { ...good, entities: good.entities.map((e) => (e.type === 'bin' ? { ...e, props: { quota: 100000 } } : e)) };
    expect(codes(greedy)).toContain('quota_unreachable');
  });
});

describe('the farm economy', () => {
  it('values a seed by what its plot earns by the season end', () => {
    // Sown on day 1 of 7: turnips three times, lettuce twice, tomatoes bear twice from one seed, corn once.
    expect(seedValue(crop('turnip'), 1, 7)).toBe(3 * (30 - 10));
    expect(seedValue(crop('lettuce'), 1, 7)).toBe(2 * (55 - 15));
    expect(seedValue(crop('tomato'), 1, 7)).toBe(2 * 40 - 35);
    expect(seedValue(crop('corn'), 1, 7)).toBe(140 - 40);
    // Corn sown on day 3 is not ripe before the season ends.
    expect(seedValue(crop('corn'), 3, 7)).toBe(0);
    expect(seedToSow(DEFAULT_CROPS, 1, 7, (id) => (id === 'turnip' || id === 'corn' ? 2 : 0))).toBe(crop('corn'));
    expect(seedToSow(DEFAULT_CROPS, 4, 7, (id) => (id === 'corn' ? 2 : 0))).toBeNull();
  });

  it('buys the crop that earns a plot most when the purse can sow every plot, the best return on its price when it cannot', () => {
    const none = () => 0;
    // Four plots, 100 gold: a pack of lettuce sows them all, and lettuce earns a plot more than turnips.
    expect(packToBuy(DEFAULT_CROPS, 1, 7, 100, 5, 4, none)?.id).toBe('lettuce');
    // Twenty-four plots and the same purse: turnips grow it fastest.
    expect(packToBuy(DEFAULT_CROPS, 1, 7, 100, 5, 24, none)?.id).toBe('turnip');
    // Seeds in the bag fill plots first; nothing the purse cannot pay for; nothing that cannot ripen.
    expect(packToBuy(DEFAULT_CROPS, 1, 7, 100, 5, 4, (id) => (id === 'turnip' ? 4 : 0))).toBeNull();
    expect(packToBuy(DEFAULT_CROPS, 1, 7, 40, 5, 4, none)).toBeNull();
    expect(packToBuy(DEFAULT_CROPS, 6, 7, 1000, 5, 4, none)).toBeNull();
  });

  it("an ideal season earns more with more plots, and a quota asks a share of it that rises with difficulty", () => {
    const rules = farmRules(() => ({}));
    expect(idealSeason(20, DEFAULT_CROPS, rules).gold).toBeGreaterThan(idealSeason(10, DEFAULT_CROPS, rules).gold);
    const ideal = idealSeason(12, DEFAULT_CROPS, rules).gold;
    const easy = seasonQuota(12, 0.15, DEFAULT_CROPS, rules);
    const hard = seasonQuota(12, 0.75, DEFAULT_CROPS, rules);
    expect(easy).toBeGreaterThan(rules.startGold);
    expect(hard).toBeGreaterThan(easy);
    expect(hard).toBeLessThan(ideal);
    // Without a shop only the starter seeds are sown; without an energy bar every job is free.
    const noShop = farmRules((id) => (id === 'shop' ? undefined : {}));
    expect(noShop.packSize).toBeNull();
    expect(idealSeason(12, DEFAULT_CROPS, noShop).gold).toBeLessThan(ideal);
    expect(farmRules((id) => (id === 'energy' ? undefined : {})).maxEnergy).toBeNull();
  });

  it('follows a crop table of its own', () => {
    const melon: Crop = { id: 'melon', name: 'Moon melon', seedPrice: 20, sellPrice: 90, growDays: 3, look: { shape: 'bush', color: '#c8f0ff' } };
    const rules = farmRules(() => ({}));
    expect(idealSeason(12, [melon], rules).gold).toBeGreaterThan(idealSeason(12, [crop('turnip')], rules).gold);
  });
});

describe('the farmer', () => {
  it('makes the quota of every season a game plans, at the seed each is played with', () => {
    const o = options();
    for (const tier of ['small', 'large'] as const) {
      const plan = levelPlan('farm', { levels: lifesim.scopeBudget[tier].levels, bosses: 0, tier });
      for (const slot of plan) {
        const level = { ...generateFarm({ seed: 11 + slot.index, difficulty: slot.difficulty }), ramp: { segment: slot.index, difficulty: slot.difficulty } };
        const sim = createSim({ ...o, level, seed: slot.seed });
        const r = runBot(sim, lifesim.bots['farmer']!, levelTicksOf(o));
        expect(r.completed, `${tier} ${slot.id}: ${String(sim.world.hud['gold'])} of ${String(sim.world.hud['quota'])}`).toBe(true);
        expect(r.events['menu_choose']).toBeGreaterThan(0);
      }
    }
  });

  it('wins on short days and long seasons too, and a run replays to the same farm', () => {
    const variants: Array<Record<string, Record<string, number>>> = [{ 'day-clock': { dayLengthS: 30 } }, { season: { days: 14 } }, { energy: { maxEnergy: 15 } }, { shop: { packSize: 1 } }];
    for (const params of variants) {
      const o = options(params);
      const sim = createSim({ ...o, level: generateFarm({ seed: 4, difficulty: 0.6 }), seed: levelSeed(DEFAULT_SEED, 0) });
      expect(runBot(sim, lifesim.bots['farmer']!, levelTicksOf(o)).completed, JSON.stringify(params)).toBe(true);
    }
    const o = options();
    const level = generateFarm({ seed: 2, difficulty: 0.3 });
    const sim = createSim({ ...o, level, seed: 1 });
    const r = runBot(sim, lifesim.bots['farmer']!, levelTicksOf(o));
    const replay = createSim({ ...o, level, seed: 1 });
    replay.run(scriptFromLog(sim, sim.tick), sim.tick);
    expect(replay.world.flags.won).toBe(true);
    expect(replay.hash()).toBe(r.finalHash);
    // Loaded from a save mid-season, it farms on from there to the same end.
    const resumed = createSim({ ...o, level, seed: 1 });
    const mem: Record<string, number> = {};
    for (let t = 0; t < 1500; t++) resumed.step(lifesim.bots['farmer']!(resumed, resumed.tick, mem));
    resumed.load(resumed.save());
    expect(runBot(resumed, lifesim.bots['farmer']!, levelTicksOf(o)).completed).toBe(true);
  });

  it('a season is not won by doing nothing or by mashing keys, and lasts no longer than its days', () => {
    const o = options();
    const level = generateFarm({ seed: 6, difficulty: 0.15 });
    const afk = createSim({ ...o, level, seed: 1 });
    const idle = runBot(afk, lifesim.bots['afk']!, levelTicksOf(o));
    expect(idle.completed).toBe(false);
    expect(afk.world.flags.gameOver).toBe(true);
    expect(idle.ticks).toBeLessThan(levelTicksOf(o));
    expect(runBot(createSim({ ...o, level, seed: 1 }), lifesim.bots['chaos']!, levelTicksOf(o)).completed).toBe(false);
  });
});
