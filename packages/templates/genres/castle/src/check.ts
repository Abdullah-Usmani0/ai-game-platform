import { botRandom, type BotPolicy, type GenreCheck } from '@gg/template-core';
import { platformerCheck } from '@gg/template-platformer/check';
import { human, route } from './bots.js';
import { castleRuntime } from './index.js';
import { validateRegion } from './level/validate.js';

const platformerChaos = platformerCheck.bots['chaos']!;
/**
 * A button masher: the platformer's random runs, jumps and dashes, with the sword's keys pressed at random as well (cuts,
 * parries, a flask, the plunge). Mashing must not win a fight: the boss outlasts it.
 */
const chaos: BotPolicy = (sim, tick, mem) => {
  const input = platformerChaos(sim, tick, mem);
  const rnd = botRandom(sim, mem);
  input.action = rnd.chance(0.35);
  input.guard = rnd.chance(0.1);
  input.item = rnd.chance(0.02);
  input.down = rnd.chance(0.1);
  return input;
};

export const BOTS: Record<string, BotPolicy> = {
  route,
  // The route bot played as a person would: late to see a wind-up, a parry sometimes off. Every fight must fall to it.
  human,
  // The platformer's greedy walker holds right and never goes back for a relic: a gated region must stop it.
  walker: platformerCheck.bots['walker']!,
  // A masher: random runs and jumps, the sword's keys pressed at random too.
  chaos,
};

/** Browser-safe: the region validator (the world solver), the bots and the route solver. */
export const castleCheck: GenreCheck = {
  runtime: castleRuntime,
  validate: (level, feel) => validateRegion(level, feel),
  bots: BOTS,
  solverBot: 'route',
  fairBot: 'human',
};
