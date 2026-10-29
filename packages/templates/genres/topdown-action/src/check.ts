import type { GenreCheck } from '@gg/template-core';
import { BOTS } from './bots.js';
import { topdownActionRuntime } from './index.js';
import { validateRooms } from './level/validate.js';

/** Browser-safe: the rooms validator, the bots and the clearer solver. */
export const topdownActionCheck: GenreCheck = {
  runtime: topdownActionRuntime,
  validate: (level) => validateRooms(level),
  bots: BOTS,
  solverBot: 'clearer',
};
