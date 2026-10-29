import { validateArena, type GenreCheck } from '@gg/template-core';
import { BOTS } from './bots.js';
import { shmupRuntime } from './index.js';

/** Browser-safe: the arena validator, the bots and the dodger solver. */
export const shmupCheck: GenreCheck = {
  runtime: shmupRuntime,
  validate: (level) => validateArena(level),
  bots: BOTS,
  solverBot: 'dodger',
};
