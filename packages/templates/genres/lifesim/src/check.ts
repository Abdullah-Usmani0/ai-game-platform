import type { GenreCheck } from '@gg/template-core';
import { BOTS } from './bots.js';
import { lifesimRuntime } from './index.js';
import { validateFarm } from './level/validate.js';

/** Browser-safe: the farm validator, the bots and the farmer solver. */
export const lifesimCheck: GenreCheck = {
  runtime: lifesimRuntime,
  validate: (level) => validateFarm(level),
  bots: BOTS,
  solverBot: 'farmer',
};
