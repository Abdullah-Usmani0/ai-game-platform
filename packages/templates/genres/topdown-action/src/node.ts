import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelJson } from '@gg/schemas';
import type { GenreManifest } from '@gg/template-core';
import { BOTS } from './bots.js';
import { EXEMPLARS } from './exemplars.js';
import { topdownActionRuntime } from './index.js';
import { generateRooms } from './level/generate.js';
import { validateRooms } from './level/validate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const topdownAction: GenreManifest = {
  ...topdownActionRuntime,
  levelGrammar: { kind: 'rooms', generate: generateRooms, validate: (level: LevelJson) => validateRooms(level) },
  bots: BOTS,
  solverBot: 'clearer',
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  scopeBudget: {
    small: { levels: 2, enemies: 2, items: 1, bosses: 0 },
    medium: { levels: 4, enemies: 3, items: 2, bosses: 0 },
    large: { levels: 6, enemies: 3, items: 3, bosses: 1 },
  },
  gddDefaults: {
    pillars: ['every room is a readable fight', 'hits land heavy, dashes feel safe', 'clear the room to open the door'],
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
