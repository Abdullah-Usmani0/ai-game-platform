import type { LevelJson } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions } from '@gg/sdk';
import { dayClock, ENTITY_DEFS, energy, farming, FEEL, movementTopdown, PLAYER, season, shipping, shop, sleep } from '@gg/template-lifesim';
import crops from '../content/crops.json';
import l01 from '../content/levels/L01-spring.json';
import l02 from '../content/levels/L02-summer.json';
import l03 from '../content/levels/L03-autumn.json';
import feedbackJson from '../design/feedback.json';

/** Three seasons at Willowbrook, each on a bigger field with a more demanding buyer; its own crops in content/crops.json. */
export const LEVELS: LevelJson[] = [l01 as unknown as LevelJson, l02 as unknown as LevelJson, l03 as unknown as LevelJson];
export const FEEDBACK = feedbackJson as FeedbackBinding[];

export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: FEEL['farm-stroll']!,
  systems: [movementTopdown, dayClock, farming, shipping, season, shop, sleep, energy, feedbackBinder(FEEDBACK)],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: [],
  params: {
    'movement-topdown': { dash: false, cornerSlip: 3 },
    'day-clock': { dayLengthS: 120 },
    farming: { starterSeeds: 6, tillCost: 2, waterCost: 1 },
    shipping: {},
    season: { days: 7, share: 0.6, startGold: 100 },
    shop: { packSize: 5 },
    sleep: {},
    energy: { maxEnergy: 60 },
  },
  content: { crops },
  movementMode: 'topdown',
};
