import type { Crop, CropTable, SystemsJson } from '@gg/schemas';
import { err, warn, type Issue } from '@gg/validators';
import { idealSeason, plotSeason } from './systems/economy.js';
import { SHELF } from './systems/farm-kit.js';
import { farmRules, type FarmRules } from './systems/rules.js';

/** A field the size of an early season's, and the largest the farm grammar lays out. */
const TYPICAL_PLOTS = 12;
const LARGEST_PLOTS = 30;
/** Letters a crop's name may have to fit the HUD beside a five-digit purse and quota ("MOON MELON 30"). */
export const CROP_NAME_MAX = 10;

/** A game's farm rules from its systems.json: a system it selects with no parameters takes its defaults. */
export function farmRulesFromSystems(systems: Pick<SystemsJson, 'systems'>): FarmRules {
  return farmRules((id) => {
    const s = systems.systems.find((x) => x.id === id);
    return s ? (s.params ?? {}) : undefined;
  });
}

/** A farm's rules in words, for whoever writes its crops. */
export function describeFarmRules(r: FarmRules): string {
  return [
    `A season of ${r.days} days, each ${r.dayLengthS} seconds from six in the morning to two at night.`,
    `The purse starts at ${r.startGold} gold${r.starterSeeds > 0 ? `, and the farmer with ${r.starterSeeds} seeds of the first crop` : ''}.`,
    r.packSize !== null ? `The seed shop sells packs of ${r.packSize}.` : 'There is no seed shop: only the starter seeds get sown.',
    r.maxEnergy !== null ? `A day has ${r.maxEnergy} energy: tilling a plot costs ${r.tillCost}, watering ${r.waterCost}.` : 'Work costs no energy.',
  ].join(' ');
}

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const distance = (a: string, b: string): number => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Whether crop b is no better than crop a in any way and worse in one: seeds no one would buy. */
function worseThan(b: Crop, a: Crop): boolean {
  const regrows = b.regrowDays === undefined || (a.regrowDays !== undefined && a.regrowDays <= b.regrowDays);
  if (!(a.seedPrice <= b.seedPrice && a.sellPrice >= b.sellPrice && a.growDays <= b.growDays && regrows)) return false;
  return a.seedPrice < b.seedPrice || a.sellPrice > b.sellPrice || a.growDays < b.growDays || (b.regrowDays !== undefined && a.regrowDays! < b.regrowDays);
}

/**
 * What a crop table has to do for the game's rules, beyond its schema. An error leaves nothing worth farming: no crop
 * that ripens in the season, or a season that earns next to nothing on a small field, or two crops of one name. A
 * warning is a card no player should be shown: starter seeds that never ripen, seeds that never pay or that another
 * crop beats in every way, crops a game without a shop never sells, two crops that look alike in the field, a name
 * too long for the HUD, a purse too big for it, or a shop with little to choose from.
 */
export function cropTableIssues(table: CropTable, rules: FarmRules): Issue[] {
  const issues: Issue[] = [];
  const crops = table.crops;
  const shelf = crops.slice(0, SHELF);
  const first = crops[0]!;
  const ripens = (c: Crop) => c.growDays <= rules.days - 1;
  if (!shelf.some(ripens)) issues.push(err('crops_unripe', `no crop ripens in a season of ${rules.days} days: growDays must be at most ${rules.days - 1}`));
  if (rules.starterSeeds > 0 && !ripens(first)) issues.push(warn('starter_unripe', `the starter seeds (${first.name}, the first crop) take ${first.growDays} days and never ripen in a ${rules.days}-day season`));

  const earned = idealSeason(TYPICAL_PLOTS, crops, rules).gold - rules.startGold;
  const floor = Math.max(150, rules.startGold);
  if (earned < floor) issues.push(err('crops_barren', `an ideal season on ${TYPICAL_PLOTS} plots earns only ${earned} gold (at least ${floor}): raise the sell prices or shorten the growing`));
  const richest = idealSeason(LARGEST_PLOTS, crops, rules).gold;
  if (richest > 99_999) issues.push(warn('crops_rich', `an ideal season on ${LARGEST_PLOTS} plots ends with ${richest} gold, more than the HUD's five digits: lower the prices`));

  for (const c of shelf) {
    // Starter seeds that never ripen are told above; any other crop that never ripens is seeds the shop should not sell.
    if (!ripens(c)) {
      if (c !== first || rules.starterSeeds === 0) issues.push(warn('crop_trap', `${c.name} takes ${c.growDays} days and never ripens in a ${rules.days}-day season`));
    } else if (plotSeason(c, rules.days).profit <= 0) {
      issues.push(warn('crop_trap', `${c.name} never pays in a ${rules.days}-day season: seeds ${c.seedPrice}, sells for ${c.sellPrice} after ${c.growDays} days${c.regrowDays ? `, then every ${c.regrowDays}` : ''}`));
    }
    const better = shelf.find((a) => a !== c && worseThan(c, a));
    if (better) issues.push(warn('crop_dominated', `${c.name} is no better than ${better.name} in any way: nobody would buy it`));
  }
  if (rules.packSize === null && crops.length > 1) issues.push(warn('crop_unsold', `the game has no seed shop: only ${first.name}, the starter seeds, is ever sown`));
  else if (crops.length < 3) issues.push(warn('crops_few', `${crops.length === 1 ? 'one crop leaves' : 'two crops leave'} the shop little to choose from: write three or four`));

  for (let i = 0; i < crops.length; i++) {
    const a = crops[i]!;
    if (a.name.length > CROP_NAME_MAX) issues.push(warn('crop_name_long', `"${a.name}" is longer than ${CROP_NAME_MAX} letters: the HUD shows the seed in hand by name`));
    for (const b of crops.slice(i + 1)) {
      if (a.name.toLowerCase() === b.name.toLowerCase()) issues.push(err('crop_name_twice', `two crops are called ${a.name}`));
      else if (a.look.shape === b.look.shape && distance(a.look.color, b.look.color) < 64) issues.push(warn('crop_lookalike', `${a.name} and ${b.name} look alike in the field: the same shape in near colours`));
    }
  }
  return issues;
}
