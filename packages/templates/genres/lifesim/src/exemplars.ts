import { systemsJsonFor, type Exemplar } from '@gg/template-core';
import { lifesimRuntime } from './index.js';
import { generateFarm } from './level/generate.js';

const cosy = systemsJsonFor(lifesimRuntime);
const tuned = (params: Record<string, Record<string, number>>) => ({ ...cosy, systems: cosy.systems.map((s) => ({ ...s, params: { ...s.params, ...params[s.id] } })) });

/** The first systems exemplar is what a dry run builds: the whole cosy farm. */
export const EXEMPLARS: Exemplar[] = [
  {
    kind: 'systems',
    prompt: "A cosy Stardew-like farm: till, sow, water and harvest, ship produce at the bin, buy seeds at the stall, sleep to end the day, and make each season's quota.",
    artifact: cosy,
  },
  {
    kind: 'systems',
    prompt: 'A hard-scrabble homestead: short days, little energy, a demanding buyer and long seasons.',
    artifact: tuned({ 'day-clock': { dayLengthS: 80 }, energy: { maxEnergy: 40 }, season: { days: 10, share: 0.75 } }),
  },
  {
    kind: 'systems',
    prompt: 'A gentle garden for a first-time player: long days, plenty of energy and a buyer happy with a little.',
    artifact: tuned({ 'day-clock': { dayLengthS: 180 }, energy: { maxEnergy: 100 }, season: { share: 0.4, startGold: 150 } }),
  },
  { kind: 'level', prompt: 'A first season: a small field near the farmhouse.', artifact: generateFarm({ seed: 7, difficulty: 0.15 }) },
  { kind: 'level', prompt: 'A busy late season: a big field split in two, a long walk to the stall.', artifact: generateFarm({ seed: 19, difficulty: 0.7 }) },
];
