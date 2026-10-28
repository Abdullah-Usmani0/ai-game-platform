import type { BehaviourFsm, EcaRule, LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, type SimOptions } from '@gg/sdk';
import walkerJson from '../content/behaviour/walker.fsm.json';
import l01Json from '../content/levels/l01.json';
import coinSfxJson from '../content/rules/coin-sfx.eca.json';
import { ENTITY_DEFS, PLAYER } from './entities.js';
import { combat } from './systems/combat.js';
import { goal } from './systems/goal.js';
import { hazards } from './systems/hazards.js';
import { movement } from './systems/movement.js';
import { pickups } from './systems/pickups.js';

export const LEVELS: LevelJson[] = [l01Json as unknown as LevelJson];
export const BEHAVIOURS: BehaviourFsm[] = [walkerJson as unknown as BehaviourFsm];
export const RULES: EcaRule[] = [coinSfxJson as unknown as EcaRule];

/** Everything the sim needs except the level and seed; shared by the browser bundle and Node tests. */
export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: CELESTE_CLASS,
  systems: [movement, hazards, combat, pickups, goal],
  entityDefs: ENTITY_DEFS,
  player: PLAYER,
  behaviours: BEHAVIOURS,
  rules: RULES,
};
