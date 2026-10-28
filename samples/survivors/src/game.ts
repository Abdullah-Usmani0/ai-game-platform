import type { BehaviourFsm, LevelJson, WaveTable } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions } from '@gg/sdk';
import { autoAttack, ENTITY_DEFS, FEEL, movementTopdown, pickups, PLAYER, spawner, survival } from '@gg/template-survivors';
import arenaJson from '../content/arena.json';
import chaserJson from '../content/behaviour/chaser.fsm.json';
import wavesJson from '../content/waves.json';
import feedbackJson from '../design/feedback.json';

export const LEVELS: LevelJson[] = [arenaJson as unknown as LevelJson];
export const BEHAVIOURS: BehaviourFsm[] = [chaserJson as unknown as BehaviourFsm];
export const WAVES = wavesJson as unknown as WaveTable;
export const FEEDBACK = feedbackJson as FeedbackBinding[];

export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: FEEL['arena-melee']!,
  systems: [movementTopdown, autoAttack, spawner, pickups, survival, feedbackBinder(FEEDBACK)],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: BEHAVIOURS,
  params: { survival: { winAtS: 60 }, 'auto-attack': { range: 40, damage: 1, cooldownTicks: 30 } },
  content: { waves: WAVES },
  movementMode: 'topdown',
};
