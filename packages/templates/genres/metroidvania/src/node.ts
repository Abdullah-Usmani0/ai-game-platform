import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GenreManifest } from '@gg/template-core';
import { metroidvaniaCheck } from './check.js';
import { EXEMPLARS } from './exemplars.js';
import { metroidvaniaRuntime } from './index.js';
import { generateExplore } from './level/generate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const metroidvania: GenreManifest = {
  ...metroidvaniaRuntime,
  levelGrammar: { kind: 'tilemap', generate: generateExplore, validate: metroidvaniaCheck.validate },
  bots: metroidvaniaCheck.bots,
  solverBot: metroidvaniaCheck.solverBot,
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  scopeBudget: {
    small: { levels: 1, enemies: 2, items: 3, bosses: 0 },
    medium: { levels: 2, enemies: 3, items: 4, bosses: 0 },
    large: { levels: 3, enemies: 3, items: 5, bosses: 1 },
  },
  gddDefaults: {
    pillars: ['every wall is a promise', 'a new ability changes the map', 'backtracking pays off'],
    verbs: ['run', 'jump', 'dash', 'stomp', 'explore'],
    feedbackEvents: [
      { event: 'jump', channels: ['sfx'] },
      { event: 'land', channels: ['sfx'] },
      { event: 'dash', channels: ['sfx', 'particle'] },
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx', 'particle', 'flash'] },
      { event: 'checkpoint', channels: ['sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
    targets: { sessionMin: 6, levelTimeS: 60, deathsPerLevel: 3 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/metroidvania'],
};
export * from './index.js';
export * from './check.js';
export { generateExplore, CLIFF_TILES, DASH_PIT_TILES, PILLAR_TILES } from './level/generate.js';
export { validateExplore } from './level/validate.js';
export { progression, envelopeFor, type Abilities, type Progression, type ProgressStep } from './level/progress.js';
export { BOTS, seeker } from './bots.js';
