import type { GenreCheck } from '@gg/template-core';
import { BOTS } from './bots.js';
import { survivorsRuntime } from './index.js';
import { validateArena } from './level/validate.js';

/** Browser-safe: the arena validator, the bots and the kiter solver. */
export const survivorsCheck: GenreCheck = {
  runtime: survivorsRuntime,
  validate: (level) => validateArena(level),
  bots: BOTS,
  solverBot: 'kiter',
};
