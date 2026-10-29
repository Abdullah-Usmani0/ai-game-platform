import type { GenreCheck } from '@gg/template-core';
import { BOTS } from './bots.js';
import { puzzleRuntime } from './index.js';
import { validatePuzzle } from './level/validate.js';

/** Browser-safe: the solver as validator, the solver bot and the chaos bot. */
export const puzzleCheck: GenreCheck = {
  runtime: puzzleRuntime,
  validate: (level) => validatePuzzle(level),
  bots: BOTS,
  solverBot: 'solver',
};
