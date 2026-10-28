import type { BehaviourFsm } from '@gg/schemas';

/** Drones dive, weave side to side and fire aimed bullets; they leave at the bottom. */
export const DRONE: BehaviourFsm = {
  version: 1,
  id: 'drone',
  designNotes: 'Dives from the top, weaves left and right, fires an aimed bullet every 1.4 s, leaves at the bottom.',
  initial: 'dive',
  states: {
    dive: { onEnter: [{ kind: 'play_anim', anim: 'fly' }], update: [{ kind: 'set_velocity', vx: 0, vy: 42 }, { kind: 'shoot', projectile: 'bullet', speed: 90, cooldownMs: 1400 }], transitions: [{ to: 'gone', when: { kind: 'grounded' } }, { to: 'left', when: { kind: 'timer_elapsed', ms: 800 } }] },
    left: { onEnter: [], update: [{ kind: 'set_velocity', vx: -38, vy: 28 }, { kind: 'shoot', projectile: 'bullet', speed: 90, cooldownMs: 1400 }], transitions: [{ to: 'gone', when: { kind: 'grounded' } }, { to: 'right', when: { kind: 'any', of: [{ kind: 'timer_elapsed', ms: 700 }, { kind: 'hit_wall' }] } }] },
    right: { onEnter: [], update: [{ kind: 'set_velocity', vx: 38, vy: 28 }, { kind: 'shoot', projectile: 'bullet', speed: 90, cooldownMs: 1400 }], transitions: [{ to: 'gone', when: { kind: 'grounded' } }, { to: 'left', when: { kind: 'any', of: [{ kind: 'timer_elapsed', ms: 700 }, { kind: 'hit_wall' }] } }] },
    gone: { onEnter: [{ kind: 'despawn' }], update: [], transitions: [] },
  },
};

/** Tanks descend slowly and fire bursts; they soak hits. */
export const TANK: BehaviourFsm = {
  version: 1,
  id: 'tank',
  designNotes: 'Slow straight descent with an aimed bullet every 0.8 s; 6 hp.',
  initial: 'descend',
  states: {
    descend: { onEnter: [{ kind: 'play_anim', anim: 'fly' }], update: [{ kind: 'set_velocity', vx: 0, vy: 14 }, { kind: 'shoot', projectile: 'bullet', speed: 75, cooldownMs: 800 }], transitions: [{ to: 'gone', when: { kind: 'grounded' } }] },
    gone: { onEnter: [{ kind: 'despawn' }], update: [], transitions: [] },
  },
};

/** Power pickups drift down and vanish at the bottom. */
export const DRIFT: BehaviourFsm = {
  version: 1,
  id: 'drift',
  designNotes: 'Falls slowly; gone at the bottom.',
  initial: 'fall',
  states: {
    fall: { onEnter: [], update: [{ kind: 'set_velocity', vx: 0, vy: 30 }], transitions: [{ to: 'gone', when: { kind: 'grounded' } }] },
    gone: { onEnter: [{ kind: 'despawn' }], update: [], transitions: [] },
  },
};

export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [DRONE, TANK, DRIFT];
export const VOCAB = {
  conditions: ['always', 'timer_elapsed', 'player_within', 'player_beyond', 'hp_below', 'hit_wall', 'grounded', 'took_damage', 'flag', 'chance', 'all', 'any'],
  actions: ['idle', 'move_toward_player', 'move_away_from_player', 'set_velocity', 'shoot', 'play_anim', 'emit', 'set_flag', 'turn_around', 'despawn'],
};
