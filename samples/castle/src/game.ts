import type { BehaviourFsm, LevelJson } from '@gg/schemas';
import type { FeedbackBinding, SimOptions } from '@gg/sdk';
import { castleRuntime } from '@gg/template-castle';
import { simOptionsFor, systemsJsonFor } from '@gg/template-core';
import gargoyleJson from '../content/behaviour/gargoyle.fsm.json';
import ghoulJson from '../content/behaviour/ghoul.fsm.json';
import houndJson from '../content/behaviour/hound.fsm.json';
import archerJson from '../content/behaviour/bone-archer.fsm.json';
import sentinelJson from '../content/behaviour/sentinel.fsm.json';
import wraithJson from '../content/behaviour/wraith.fsm.json';
import levelJson from '../content/levels/R01-salt-chapel.json';
import movesJson from '../content/moves.json';
import feedbackJson from '../design/feedback.json';

export const LEVELS: LevelJson[] = [levelJson as unknown as LevelJson];
export const BEHAVIOURS: BehaviourFsm[] = [ghoulJson, houndJson, gargoyleJson, sentinelJson, wraithJson, archerJson] as unknown as BehaviourFsm[];
export const FEEDBACK = feedbackJson as FeedbackBinding[];

/**
 * Every castle system at the genre's own settings: the sword (its frame data in content/moves.json, which the view draws
 * the cuts by), rooms, rests that reload the region, the relics, hazards and the shortcut's grate.
 */
export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = simOptionsFor(castleRuntime, systemsJsonFor(castleRuntime), { behaviours: BEHAVIOURS, feedback: FEEDBACK, content: { moves: movesJson } });
