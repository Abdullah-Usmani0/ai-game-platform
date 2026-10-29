import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GenreManifest } from '@gg/template-core';
import { topdownActionCheck } from './check.js';
import { EXEMPLARS } from './exemplars.js';
import { topdownActionRuntime } from './index.js';
import { generateRooms } from './level/generate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const topdownAction: GenreManifest = {
  ...topdownActionRuntime,
  levelGrammar: { kind: 'rooms', generate: generateRooms, validate: topdownActionCheck.validate },
  bots: topdownActionCheck.bots,
  solverBot: topdownActionCheck.solverBot,
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  scopeBudget: {
    small: { levels: 2, enemies: 2, items: 1, bosses: 0 },
    medium: { levels: 4, enemies: 3, items: 2, bosses: 1 },
    large: { levels: 6, enemies: 4, items: 3, bosses: 1 },
  },
  gddDefaults: {
    pillars: ['every room is a readable fight', 'hits land heavy, dashes feel safe', 'every floor makes the run stronger'],
    verbs: ['move', 'dash', 'attack'],
    feedbackEvents: [
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['hitstop', 'shake', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
    targets: { sessionMin: 6, levelTimeS: 90, deathsPerLevel: 2 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/topdown-action'],
};
export * from './index.js';
export { generateRooms } from './level/generate.js';
export { validateRooms, tileDistances } from './level/validate.js';
export { BOTS, nextTileToward } from './bots.js';
export * from './check.js';
