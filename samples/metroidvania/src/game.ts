import type { BehaviourFsm, LevelJson } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions } from '@gg/sdk';
import { ENTITY_DEFS, FEEL, PLAYER, movement, pickups, relics } from '@gg/template-metroidvania';
import { combat, goal, hazards } from '@gg/template-platformer';
import hopperJson from '../content/behaviour/hopper.fsm.json';
import turretJson from '../content/behaviour/turret.fsm.json';
import walkerJson from '../content/behaviour/walker.fsm.json';
import levelJson from '../content/levels/L01-undervault.json';
import feedbackJson from '../design/feedback.json';

export const LEVELS: LevelJson[] = [levelJson as unknown as LevelJson];
export const BEHAVIOURS: BehaviourFsm[] = [walkerJson as unknown as BehaviourFsm, hopperJson as unknown as BehaviourFsm, turretJson as unknown as BehaviourFsm];
export const FEEDBACK = feedbackJson as FeedbackBinding[];

export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: FEEL['celeste-class']!,
  systems: [movement, relics, hazards, goal, combat, pickups, feedbackBinder(FEEDBACK)],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: BEHAVIOURS,
  params: { relics: { relicScore: 25 }, hazards: { respawnDelayTicks: 30 }, goal: { bonus: 20 }, pickups: { value: 1 } },
  movementMode: 'platformer',
};
