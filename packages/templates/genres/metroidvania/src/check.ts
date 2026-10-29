import type { GenreCheck } from '@gg/template-core';
import { BOTS } from './bots.js';
import { metroidvaniaRuntime } from './index.js';
import { validateExplore } from './level/validate.js';

/** Browser-safe: the ability-gated explorer validator, the bots and the seeker solver. */
export const metroidvaniaCheck: GenreCheck = {
  runtime: metroidvaniaRuntime,
  validate: (level, feel) => validateExplore(level, feel),
  bots: BOTS,
  solverBot: 'seeker',
};
