import type { BehaviourFsm, LevelJson, WaveTable } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions } from '@gg/sdk';
import { ENTITY_DEFS, FEEL, movementTopdown, pickups, PLAYER, playerShooter, spawner, survival } from '@gg/template-shmup';
import driftJson from '../content/behaviour/drift.fsm.json';
import droneJson from '../content/behaviour/drone.fsm.json';
import tankJson from '../content/behaviour/tank.fsm.json';
import skyJson from '../content/levels/L01-sky.json';
import wavesJson from '../content/waves.json';
import feedbackJson from '../design/feedback.json';

export const LEVELS: LevelJson[] = [skyJson as unknown as LevelJson];
export const BEHAVIOURS: BehaviourFsm[] = [droneJson as unknown as BehaviourFsm, tankJson as unknown as BehaviourFsm, driftJson as unknown as BehaviourFsm];
export const WAVES = wavesJson as unknown as WaveTable;
export const FEEDBACK = feedbackJson as FeedbackBinding[];

export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: FEEL['arcade-ship']!,
  systems: [movementTopdown, playerShooter, spawner, pickups, survival, feedbackBinder(FEEDBACK)],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: BEHAVIOURS,
  params: { survival: { winAtS: 60 }, 'player-shooter': { fireCooldownTicks: 8, damage: 1, spread: 1 }, spawner: { maxAlive: 40 }, pickups: { value: 5 } },
  content: { waves: WAVES },
  movementMode: 'topdown',
};
