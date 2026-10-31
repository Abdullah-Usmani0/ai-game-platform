import type { BehaviourFsm } from '@gg/schemas';
import { VOCAB as PLATFORMER_VOCAB } from '@gg/template-platformer';

/** Speeds and ranges are the platformer's own behaviours at twice the scale: the same tiles a second on 16 px tiles. */
export const GHOUL: BehaviourFsm = {
  version: 1,
  id: 'ghoul',
  designNotes: 'Shambles along its floor; lurches at the player who comes close and loses interest when they get away.',
  initial: 'shamble',
  states: {
    shamble: { onEnter: [{ kind: 'play_anim', anim: 'walk' }], update: [{ kind: 'patrol', speed: 40 }], transitions: [{ to: 'lurch', when: { kind: 'player_within', px: 96 } }] },
    lurch: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_toward_player', speed: 76 }], transitions: [{ to: 'shamble', when: { kind: 'player_beyond', px: 192 } }] },
  },
};

export const HOUND: BehaviourFsm = {
  version: 1,
  id: 'hound',
  designNotes: 'Crouches, then bounds at the player in low leaps.',
  initial: 'crouch',
  states: {
    crouch: { onEnter: [{ kind: 'idle' }], update: [], transitions: [{ to: 'bound', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 800 }, { kind: 'grounded' }, { kind: 'player_within', px: 160 }] } }] },
    bound: { onEnter: [{ kind: 'move_toward_player', speed: 120 }, { kind: 'jump', vy: -200 }], update: [], transitions: [{ to: 'crouch', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 300 }, { kind: 'grounded' }] } }] },
  },
};

export const GARGOYLE: BehaviourFsm = {
  version: 1,
  id: 'gargoyle',
  designNotes: 'A stone watcher; wakes when the player comes into range and spits an ember at them every second and a half.',
  initial: 'stone',
  states: {
    stone: { onEnter: [{ kind: 'idle' }], update: [], transitions: [{ to: 'spit', when: { kind: 'player_within', px: 192 } }] },
    spit: { onEnter: [], update: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'shoot', projectile: 'ember', speed: 150, cooldownMs: 1500 }], transitions: [{ to: 'stone', when: { kind: 'player_beyond', px: 256 } }] },
  },
};

export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [GHOUL, HOUND, GARGOYLE];
export const VOCAB = PLATFORMER_VOCAB;
