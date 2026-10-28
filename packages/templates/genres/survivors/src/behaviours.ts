import type { BehaviourFsm } from '@gg/schemas';

export const CHASER: BehaviourFsm = {
  version: 1,
  id: 'chaser',
  designNotes: 'Runs straight at the player; staggers briefly when hit.',
  initial: 'chase',
  states: {
    chase: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_toward_player', speed: 38 }], transitions: [{ to: 'stagger', when: { kind: 'took_damage' } }] },
    stagger: { onEnter: [{ kind: 'move_away_from_player', speed: 60 }], update: [], transitions: [{ to: 'chase', when: { kind: 'timer_elapsed', ms: 200 } }] },
  },
};
export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [CHASER];
export const VOCAB = {
  conditions: ['always', 'timer_elapsed', 'player_within', 'player_beyond', 'hp_below', 'took_damage', 'flag', 'chance', 'all', 'any'],
  actions: ['idle', 'move_toward_player', 'move_away_from_player', 'set_velocity', 'shoot', 'play_anim', 'emit', 'set_flag', 'damage_player', 'despawn'],
};
