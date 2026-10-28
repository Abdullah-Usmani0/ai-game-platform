import type { BehaviourFsm, EcaRule, LevelJson } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions } from '@gg/sdk';
import { combat, ENTITY_DEFS, FEEL, goal, hazards, movement, pickups, PLAYER } from '@gg/template-platformer';
import walkerJson from '../content/behaviour/walker.fsm.json';
import l01Json from '../content/levels/l01.json';
import coinSfxJson from '../content/rules/coin-sfx.eca.json';
import feedbackJson from '../design/feedback.json';

export const LEVELS: LevelJson[] = [l01Json as unknown as LevelJson];
export const BEHAVIOURS: BehaviourFsm[] = [walkerJson as unknown as BehaviourFsm];
export const RULES: EcaRule[] = [coinSfxJson as unknown as EcaRule];
export const FEEDBACK = feedbackJson as FeedbackBinding[];

/** Everything the sim needs except the level and seed; shared by the browser bundle and Node tests. */
export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: FEEL['celeste-class']!,
  systems: [movement, hazards, combat, pickups, goal, feedbackBinder(FEEDBACK)],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: BEHAVIOURS,
  rules: RULES,
  movementMode: 'platformer',
};
