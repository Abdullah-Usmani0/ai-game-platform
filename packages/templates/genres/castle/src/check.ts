import type { BotPolicy, GenreCheck } from '@gg/template-core';
import { platformerCheck } from '@gg/template-platformer/check';
import { route } from './bots.js';
import { castleRuntime } from './index.js';
import { validateRegion } from './level/validate.js';

export const BOTS: Record<string, BotPolicy> = {
  route,
  // The platformer's greedy walker holds right and never goes back for a relic: a gated region must stop it.
  walker: platformerCheck.bots['walker']!,
  chaos: platformerCheck.bots['chaos']!,
};

/** Browser-safe: the region validator (the world solver), the bots and the route solver. */
export const castleCheck: GenreCheck = {
  runtime: castleRuntime,
  validate: (level, feel) => validateRegion(level, feel),
  bots: BOTS,
  solverBot: 'route',
};
