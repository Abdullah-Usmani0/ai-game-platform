import type { BehaviourFsm } from '@gg/schemas';

export const WALKER: BehaviourFsm = {
  version: 1,
  id: 'walker',
  designNotes: 'Patrols its ledge; chases when the player comes close; gives up when the player gets away.',
  initial: 'patrol',
  states: {
    patrol: { onEnter: [{ kind: 'play_anim', anim: 'walk' }], update: [{ kind: 'patrol', speed: 25 }], transitions: [{ to: 'chase', when: { kind: 'player_within', px: 48 } }] },
    chase: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_toward_player', speed: 45 }], transitions: [{ to: 'patrol', when: { kind: 'player_beyond', px: 96 } }] },
  },
};

export const HOPPER: BehaviourFsm = {
  version: 1,
  id: 'hopper',
  designNotes: 'Waits, then hops toward the player in short bursts.',
  initial: 'wait',
  states: {
    wait: { onEnter: [{ kind: 'idle' }], update: [], transitions: [{ to: 'hop', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 700 }, { kind: 'grounded' }] } }] },
    hop: { onEnter: [{ kind: 'move_toward_player', speed: 60 }, { kind: 'jump', vy: -120 }], update: [], transitions: [{ to: 'wait', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 300 }, { kind: 'grounded' }] } }] },
  },
};

export const TURRET: BehaviourFsm = {
  version: 1,
  id: 'turret',
  designNotes: 'Stationary; fires a bolt at the player every second while they are in range.',
  initial: 'idle',
  states: {
    idle: { onEnter: [{ kind: 'idle' }], update: [], transitions: [{ to: 'fire', when: { kind: 'player_within', px: 96 } }] },
    fire: { onEnter: [], update: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'shoot', projectile: 'bolt', speed: 90, cooldownMs: 1000 }], transitions: [{ to: 'idle', when: { kind: 'player_beyond', px: 128 } }] },
  },
};

export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [WALKER, HOPPER, TURRET];

/** The subset of the schema vocabulary this genre's validator accepts. */
export const VOCAB = {
  conditions: ['always', 'timer_elapsed', 'player_within', 'player_beyond', 'hp_below', 'hit_wall', 'at_ledge', 'grounded', 'took_damage', 'flag', 'chance', 'all', 'any'],
  actions: ['idle', 'patrol', 'move_toward_player', 'move_away_from_player', 'jump', 'set_velocity', 'shoot', 'play_anim', 'emit', 'set_flag', 'turn_around', 'damage_player', 'despawn'],
};
