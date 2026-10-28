import type { BehaviourFsm, LevelJson } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions } from '@gg/sdk';
import { ENTITY_DEFS, FEEL, meleeAttack, movementTopdown, pickups, PLAYER, roomClear } from '@gg/template-topdown-action';
import archerJson from '../content/behaviour/archer.fsm.json';
import bruteJson from '../content/behaviour/brute.fsm.json';
import gruntJson from '../content/behaviour/grunt.fsm.json';
import l01 from '../content/levels/L01-ember-01.json';
import l02 from '../content/levels/L02-ember-02.json';
import feedbackJson from '../design/feedback.json';

export const LEVELS: LevelJson[] = [l01 as unknown as LevelJson, l02 as unknown as LevelJson];
export const BEHAVIOURS: BehaviourFsm[] = [gruntJson as unknown as BehaviourFsm, archerJson as unknown as BehaviourFsm, bruteJson as unknown as BehaviourFsm];
export const FEEDBACK = feedbackJson as FeedbackBinding[];

export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: FEEL['room-melee']!,
  systems: [movementTopdown, meleeAttack, roomClear, pickups, feedbackBinder(FEEDBACK)],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: BEHAVIOURS,
  params: { 'melee-attack': { damage: 1, range: 14, cooldownTicks: 18, knockback: 6 }, 'room-clear': { bonus: 20, killScore: 5 }, pickups: { value: 2 } },
  content: {},
  movementMode: 'topdown',
};
