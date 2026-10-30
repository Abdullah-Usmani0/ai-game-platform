import type { BehaviourFsm } from '@gg/schemas';

/** Nothing on a farm acts by itself yet: no behaviours ship, and the vocabulary is the top-down one for a game that adds some. */
export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [];
export const VOCAB = {
  conditions: ['always', 'timer_elapsed', 'player_within', 'player_beyond', 'flag', 'chance', 'all', 'any'],
  actions: ['idle', 'move_toward_player', 'move_away_from_player', 'set_velocity', 'play_anim', 'emit', 'set_flag', 'despawn'],
};
