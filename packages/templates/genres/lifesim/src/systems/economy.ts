import type { Crop } from '@gg/schemas';
import { SHELF } from './farm-kit.js';
import type { FarmRules } from './rules.js';

type CropTerms = Pick<Crop, 'seedPrice' | 'sellPrice' | 'growDays' | 'regrowDays'>;

/**
 * What a plot sown with a crop on `day` earns by the season's end, per seed sown that day: the harvests it brings in by
 * the last day over the seeds they take (a crop that bears again takes one; any other a new seed after each harvest).
 * A planting sown on day d and watered every day is ripe the morning growDays nights later, and a harvest pays the
 * night it is shipped, so the last that counts is on the last day. Nothing for a crop that cannot ripen in time.
 */
export function seedValue(crop: CropTerms, day: number, days: number): number {
  const left = days - day;
  if (crop.growDays > left) return 0;
  if (crop.regrowDays !== undefined) return (1 + Math.floor((left - crop.growDays) / crop.regrowDays)) * crop.sellPrice - crop.seedPrice;
  return Math.floor(left / crop.growDays) * (crop.sellPrice - crop.seedPrice);
}

/** What one plot earns in a season of `days` days with one crop, sown on the first: its harvests, and their gold over the seeds. */
export function plotSeason(crop: CropTerms, days: number): { harvests: number; profit: number } {
  const left = days - 1;
  if (crop.growDays > left) return { harvests: 0, profit: 0 };
  const harvests = crop.regrowDays !== undefined ? 1 + Math.floor((left - crop.growDays) / crop.regrowDays) : Math.floor(left / crop.growDays);
  return { harvests, profit: seedValue(crop, 1, days) };
}

/** The seed to sow next: of the seeds in the bag, the one that earns a plot most by the season's end; null when none can ripen in time. */
export function seedToSow(crops: readonly Crop[], day: number, days: number, bag: (cropId: string) => number): Crop | null {
  let best: Crop | null = null;
  let bestValue = 0;
  for (const c of crops) {
    if (bag(c.id) <= 0) continue;
    const v = seedValue(c, day, days);
    if (v > bestValue) {
      best = c;
      bestValue = v;
    }
  }
  return best;
}

/**
 * The pack of seeds to buy next on `day`, for `plots` plots still to sow today, or null. Seeds already in the bag go in
 * first. When the purse can sow every plot left with the crop that earns a plot most, that crop; short of it, the crop
 * that earns most for its price, since a small purse grows fastest on cheap quick crops. Never a crop that cannot ripen
 * before the season ends, nor a pack the purse cannot pay for.
 */
export function packToBuy(crops: readonly Crop[], day: number, days: number, gold: number, packSize: number, plots: number, bag: (cropId: string) => number): Crop | null {
  let held = 0;
  for (const c of crops) if (seedValue(c, day, days) > 0) held += bag(c.id);
  const need = plots - held;
  if (need <= 0) return null;
  const able = crops.filter((c) => seedValue(c, day, days) > 0 && c.seedPrice * packSize <= gold);
  if (able.length === 0) return null;
  const value = (c: Crop) => seedValue(c, day, days);
  const byPlot = able.reduce((a, b) => (value(b) > value(a) ? b : a));
  if (gold >= Math.ceil(need / packSize) * packSize * byPlot.seedPrice) return byPlot;
  return able.reduce((a, b) => (value(b) / b.seedPrice > value(a) / a.seedPrice ? b : a));
}

/**
 * Ticks a job takes a farmer on foot (the step to the next plot, a turn, the tool), and the day's walks to the stall,
 * the bin and the bed with the menus there: what the farmer bot takes, measured over generated farms. They only bind
 * on short days.
 */
const JOB_TICKS = 40;
const ERRAND_TICKS = 1200;

interface Soil {
  crop: Crop | null;
  age: number;
  ripe: boolean;
  tilled: boolean;
  watered: boolean;
}

/** How many of `n` jobs a budget pays for at a cost each (all of them when they are free). */
const affordable = (n: number, cost: number, budget: number) => (cost <= 0 ? n : Math.min(n, Math.floor(budget / cost)));

/**
 * A season played by the book on a field of `plots` plots, with the game's crops and rules: every morning the ripe
 * crops are harvested and shipped, the plantings watered, then the bag's seeds sown and more bought (packToBuy, from
 * the shop's shelf) while plots are left, as far as the day's energy and time go. It makes no mistakes and loses no
 * time between jobs: the measure a season's quota takes a share of.
 */
export function idealSeason(plots: number, crops: readonly Crop[], rules: FarmRules): { gold: number; harvests: number } {
  const field: Soil[] = Array.from({ length: plots }, () => ({ crop: null, age: 0, ripe: false, tilled: false, watered: false }));
  const bag = new Map<string, number>();
  if (crops.length > 0 && rules.starterSeeds > 0) bag.set(crops[0]!.id, rules.starterSeeds);
  const has = (id: string) => bag.get(id) ?? 0;
  const jobsPerDay = Math.max(4, Math.floor((rules.dayLengthS * 60 - ERRAND_TICKS) / JOB_TICKS));
  let gold = rules.startGold;
  let harvests = 0;
  for (let day = 1; day <= rules.days; day++) {
    // Without a bed, every night is fallen asleep in the field.
    let energy = rules.maxEnergy === null ? Infinity : day > 1 && !rules.bed ? Math.ceil(rules.maxEnergy / 2) : rules.maxEnergy;
    let jobs = 0;
    let pending = 0;
    const work = (cost: number, n: number): boolean => {
      if (energy < cost || jobs + n > jobsPerDay) return false;
      energy -= cost;
      jobs += n;
      return true;
    };
    for (const soil of field) {
      if (!soil.ripe || !soil.crop || !work(0, 1)) continue;
      pending += soil.crop.sellPrice;
      harvests++;
      if (soil.crop.regrowDays !== undefined) soil.age = soil.crop.growDays - soil.crop.regrowDays;
      else soil.crop = null;
      soil.ripe = false;
    }
    for (const soil of field) if (soil.crop && !soil.ripe) soil.watered = work(rules.waterCost, 1);
    // Tilled soil first: it only needs the seed and the water.
    const free = () => field.filter((b) => !b.crop).sort((a, b) => Number(b.tilled) - Number(a.tilled));
    for (;;) {
      for (const soil of free()) {
        const seed = seedToSow(crops, day, rules.days, has);
        if (!seed) break;
        if (!work((soil.tilled ? 0 : rules.tillCost) + rules.waterCost, soil.tilled ? 2 : 3)) continue;
        bag.set(seed.id, has(seed.id) - 1);
        Object.assign(soil, { crop: seed, age: 0, ripe: false, tilled: true, watered: true });
      }
      if (rules.packSize === null) break;
      // Seeds only for the plots today's energy and time can still sow.
      const open = free();
      const tilled = open.filter((b) => b.tilled).length;
      const onTilled = Math.min(affordable(tilled, rules.waterCost, energy), Math.floor((jobsPerDay - jobs) / 2));
      const fresh = Math.min(affordable(open.length - tilled, rules.tillCost + rules.waterCost, energy - onTilled * rules.waterCost), Math.floor((jobsPerDay - jobs - 2 * onTilled) / 3));
      const pack = packToBuy(crops.slice(0, SHELF), day, rules.days, gold, rules.packSize, onTilled + Math.max(0, fresh), has);
      if (!pack) break;
      gold -= pack.seedPrice * rules.packSize;
      bag.set(pack.id, has(pack.id) + rules.packSize);
    }
    for (const soil of field) {
      if (soil.crop && soil.watered && !soil.ripe && ++soil.age >= soil.crop.growDays) soil.ripe = true;
      soil.watered = false;
    }
    gold += pending;
  }
  return { gold, harvests };
}

/**
 * The season's quota when its level names none: the starting purse and a share of what an ideal farmer earns on the
 * level's plots with the game's crops and rules (idealSeason), the share rising with the level's difficulty. The
 * farmer bot plays by the same book, on foot, and proves every quota it is given can be made.
 */
export function seasonQuota(plots: number, difficulty: number, crops: readonly Crop[], rules: FarmRules): number {
  const earned = idealSeason(plots, crops, rules).gold - rules.startGold;
  const share = Math.min(0.9, rules.share * (0.75 + 0.5 * Math.max(0, Math.min(1, difficulty))));
  return rules.startGold + Math.max(10, Math.round((share * earned) / 10) * 10);
}
