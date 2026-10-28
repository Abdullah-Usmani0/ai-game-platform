import type { BehaviourFsm } from '@gg/schemas';

/** Grunts sleep until the player enters their room, rush, then bite after a readable wind-up; a hit staggers them. */
export const GRUNT: BehaviourFsm = {
  version: 1,
  id: 'grunt',
  designNotes: 'Waits in its room, rushes on sight, stops to wind up a bite (interruptible by a hit), staggers when hit, gives up when the player leaves.',
  initial: 'wait',
  states: {
    wait: { onEnter: [{ kind: 'play_anim', anim: 'idle' }], update: [{ kind: 'set_velocity', vx: 0, vy: 0 }], transitions: [{ to: 'chase', when: { kind: 'player_within', px: 84 } }, { to: 'chase', when: { kind: 'took_damage' } }] },
    chase: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_toward_player', speed: 46 }], transitions: [{ to: 'windup', when: { kind: 'player_within', px: 13 } }, { to: 'stagger', when: { kind: 'took_damage' } }, { to: 'wait', when: { kind: 'player_beyond', px: 160 } }] },
    windup: { onEnter: [{ kind: 'play_anim', anim: 'windup' }, { kind: 'emit', event: 'custom:windup' }], update: [{ kind: 'set_velocity', vx: 0, vy: 0 }], transitions: [{ to: 'stagger', when: { kind: 'took_damage' } }, { to: 'bite', when: { kind: 'timer_elapsed', ms: 300 } }] },
    bite: { onEnter: [{ kind: 'play_anim', anim: 'bite' }, { kind: 'damage_player', amount: 1 }, { kind: 'emit', event: 'custom:bite' }], update: [{ kind: 'set_velocity', vx: 0, vy: 0 }], transitions: [{ to: 'stagger', when: { kind: 'took_damage' } }, { to: 'chase', when: { kind: 'timer_elapsed', ms: 400 } }] },
    stagger: { onEnter: [{ kind: 'play_anim', anim: 'hurt' }, { kind: 'move_away_from_player', speed: 70 }], update: [], transitions: [{ to: 'chase', when: { kind: 'timer_elapsed', ms: 220 } }] },
  },
};

/** Brutes are slow, heavy and telegraph longer; their bite does two damage. */
export const BRUTE: BehaviourFsm = {
  version: 1,
  id: 'brute',
  designNotes: 'Slow chaser with a long wind-up and a two-damage bite; staggers briefly when hit.',
  initial: 'wait',
  states: {
    wait: { onEnter: [{ kind: 'play_anim', anim: 'idle' }], update: [{ kind: 'set_velocity', vx: 0, vy: 0 }], transitions: [{ to: 'chase', when: { kind: 'player_within', px: 96 } }, { to: 'chase', when: { kind: 'took_damage' } }] },
    chase: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_toward_player', speed: 34 }], transitions: [{ to: 'windup', when: { kind: 'player_within', px: 16 } }, { to: 'stagger', when: { kind: 'took_damage' } }, { to: 'wait', when: { kind: 'player_beyond', px: 180 } }] },
    windup: { onEnter: [{ kind: 'play_anim', anim: 'windup' }, { kind: 'emit', event: 'custom:windup' }], update: [{ kind: 'set_velocity', vx: 0, vy: 0 }], transitions: [{ to: 'bite', when: { kind: 'timer_elapsed', ms: 450 } }] },
    bite: { onEnter: [{ kind: 'play_anim', anim: 'bite' }, { kind: 'damage_player', amount: 2 }, { kind: 'emit', event: 'custom:bite' }], update: [{ kind: 'set_velocity', vx: 0, vy: 0 }], transitions: [{ to: 'chase', when: { kind: 'timer_elapsed', ms: 600 } }] },
    stagger: { onEnter: [{ kind: 'play_anim', anim: 'hurt' }], update: [{ kind: 'set_velocity', vx: 0, vy: 0 }], transitions: [{ to: 'chase', when: { kind: 'timer_elapsed', ms: 160 } }] },
  },
};

/** Archers keep their distance and shoot; they back off when the player closes in. */
export const ARCHER: BehaviourFsm = {
  version: 1,
  id: 'archer',
  designNotes: 'Holds position and shoots arrows while the player is in range; retreats when the player gets close.',
  initial: 'wait',
  states: {
    wait: { onEnter: [{ kind: 'play_anim', anim: 'idle' }], update: [{ kind: 'idle' }], transitions: [{ to: 'attack', when: { kind: 'player_within', px: 100 } }, { to: 'attack', when: { kind: 'took_damage' } }] },
    attack: { onEnter: [{ kind: 'play_anim', anim: 'aim' }], update: [{ kind: 'idle' }, { kind: 'shoot', projectile: 'arrow', speed: 70, cooldownMs: 1600 }], transitions: [{ to: 'retreat', when: { kind: 'player_within', px: 30 } }, { to: 'wait', when: { kind: 'player_beyond', px: 170 } }, { to: 'stagger', when: { kind: 'took_damage' } }] },
    retreat: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_away_from_player', speed: 40 }], transitions: [{ to: 'attack', when: { kind: 'player_beyond', px: 52 } }, { to: 'stagger', when: { kind: 'took_damage' } }] },
    stagger: { onEnter: [{ kind: 'play_anim', anim: 'hurt' }, { kind: 'move_away_from_player', speed: 60 }], update: [], transitions: [{ to: 'attack', when: { kind: 'timer_elapsed', ms: 260 } }] },
  },
};

export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [GRUNT, ARCHER, BRUTE];
export const VOCAB = {
  conditions: ['always', 'timer_elapsed', 'player_within', 'player_beyond', 'hp_below', 'took_damage', 'flag', 'chance', 'all', 'any'],
  actions: ['idle', 'patrol', 'move_toward_player', 'move_away_from_player', 'set_velocity', 'shoot', 'play_anim', 'emit', 'set_flag', 'turn_around', 'damage_player', 'despawn'],
};
