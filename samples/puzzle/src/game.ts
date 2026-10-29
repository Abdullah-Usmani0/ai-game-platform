import type { LevelJson } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions } from '@gg/sdk';
import { ENTITY_DEFS, FEEL, gridPush, PLAYER } from '@gg/template-puzzle';
import l01 from '../content/levels/L01-cellar-01.json';
import l02 from '../content/levels/L02-cellar-02.json';
import l03 from '../content/levels/L03-cellar-03.json';
import feedbackJson from '../design/feedback.json';

export const LEVELS: LevelJson[] = [l01 as unknown as LevelJson, l02 as unknown as LevelJson, l03 as unknown as LevelJson];
export const FEEDBACK = feedbackJson as FeedbackBinding[];

export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: FEEL['grid-snappy']!,
  systems: [gridPush, feedbackBinder(FEEDBACK)],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: [],
  params: { 'grid-push': { stepTicks: 6, repeatDelayTicks: 14, repeatTicks: 6, allowUndo: true, bonus: 10 } },
  content: {},
  movementMode: 'topdown',
};
