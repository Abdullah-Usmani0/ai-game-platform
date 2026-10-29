import type { GenreCheck } from '@gg/template-core';
import { validateLevel } from '@gg/validators';
import { BOTS } from './bots.js';
import { COLLECTIBLE_TYPES } from './entities.js';
import { platformerRuntime } from './index.js';

/** Browser-safe: the static level validator under a feel preset, the bots and the walker solver. */
export const platformerCheck: GenreCheck = {
  runtime: platformerRuntime,
  validate: (level, feel) => validateLevel(level, { feel, collectibleTypes: COLLECTIBLE_TYPES }),
  bots: BOTS,
  solverBot: 'walker',
};
