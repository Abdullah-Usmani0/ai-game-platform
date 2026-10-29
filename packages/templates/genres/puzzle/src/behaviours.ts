import type { BehaviourFsm } from '@gg/schemas';

/** Nothing on a puzzle board acts on its own: no behaviour vocabulary and no default state machines. */
export const VOCAB = { conditions: [] as string[], actions: [] as string[] };
export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [];
