import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelJson } from '@gg/schemas';
import type { FeelPreset } from '@gg/sdk';
import type { GenreManifest } from '@gg/template-core';
import { validateLevel } from '@gg/validators';
import { BOTS } from './bots.js';
import { COLLECTIBLE_TYPES } from './entities.js';
import { EXEMPLARS } from './exemplars.js';
import { platformerRuntime } from './index.js';
import { generateLevel } from './level/generate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const platformer: GenreManifest = {
  ...platformerRuntime,
  levelGrammar: {
    kind: 'tilemap',
    generate: generateLevel,
    validate: (level: LevelJson, feel: FeelPreset) => validateLevel(level, { feel, collectibleTypes: COLLECTIBLE_TYPES }),
  },
  bots: BOTS,
  solverBot: 'walker',
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  scopeBudget: {
    small: { levels: 3, enemies: 2, items: 2, bosses: 0 },
    medium: { levels: 6, enemies: 3, items: 4, bosses: 0 },
    large: { levels: 10, enemies: 3, items: 6, bosses: 1 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/platformer'],
};
export * from './index.js';
export { generateLevel } from './level/generate.js';
export { BOTS } from './bots.js';
