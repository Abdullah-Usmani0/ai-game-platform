import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelJson } from '@gg/schemas';
import type { GenreManifest } from '@gg/template-core';
import { BOTS } from './bots.js';
import { EXEMPLARS } from './exemplars.js';
import { survivorsRuntime } from './index.js';
import { generateArena, generateWaves } from './level/generate.js';
import { validateArena } from './level/validate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const survivors: GenreManifest = {
  ...survivorsRuntime,
  levelGrammar: { kind: 'arena', generate: generateArena, validate: (level: LevelJson) => validateArena(level) },
  extraContent: (params) => ({ waves: generateWaves(params, 60) }),
  bots: BOTS,
  solverBot: 'kiter',
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  scopeBudget: {
    small: { levels: 1, enemies: 2, items: 1, bosses: 0 },
    medium: { levels: 2, enemies: 2, items: 2, bosses: 0 },
    large: { levels: 3, enemies: 3, items: 3, bosses: 1 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/survivors'],
};
export * from './index.js';
export { generateArena, generateWaves } from './level/generate.js';
export { validateArena, validateWaves } from './level/validate.js';
export { BOTS } from './bots.js';
