import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GenreManifest } from '@gg/template-core';
import { lifesimCheck } from './check.js';
import { EXEMPLARS } from './exemplars.js';
import { lifesimRuntime } from './index.js';
import { generateFarm } from './level/generate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const lifesim: GenreManifest = {
  ...lifesimRuntime,
  levelGrammar: { kind: 'farm', generate: generateFarm, validate: lifesimCheck.validate },
  bots: lifesimCheck.bots,
  solverBot: lifesimCheck.solverBot,
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  // A level is a season. A farm has no enemies, items or bosses: its crops and its economy are the content.
  scopeBudget: {
    small: { levels: 2, enemies: 0, items: 0, bosses: 0 },
    medium: { levels: 3, enemies: 0, items: 0, bosses: 0 },
    large: { levels: 4, enemies: 0, items: 0, bosses: 0 },
  },
  gddDefaults: {
    pillars: ['every day ends with something grown', 'the field is a plan, never a chore', 'a season pays the patient'],
    verbs: ['move', 'work', 'choose seed'],
    feedbackEvents: [
      { event: 'pickup', channels: ['particle', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
    targets: { sessionMin: 20, levelTimeS: 300, deathsPerLevel: 0 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/lifesim'],
};
export * from './index.js';
export { generateFarm, fieldPlots, fieldShape } from './level/generate.js';
export { validateFarm, footprint, farmDistances } from './level/validate.js';
export { BOTS, farmer } from './bots.js';
export * from './check.js';
