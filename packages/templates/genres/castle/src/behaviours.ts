import type { BehaviourFsm } from '@gg/schemas';
import { VOCAB as PLATFORMER_VOCAB } from '@gg/template-platformer';

/**
 * The castle's cast. Speeds and ranges are the platformer's own behaviours at twice the scale: the same tiles a second on
 * 16 px tiles. Each attack is a move of the game's (content/moves.json), made by entering a state that plays the move's
 * clip: such a state turns to face the player as it enters, moves no further on its own (the move carries the body), and
 * waits the move out before it leaves.
 */
export const GHOUL: BehaviourFsm = {
  version: 1,
  id: 'ghoul',
  designNotes: 'Shambles along its floor; lurches at the player who comes close, and within reach raises its claws over its skull, then rakes, lunging; loses interest when they get away.',
  initial: 'shamble',
  states: {
    shamble: { onEnter: [{ kind: 'play_anim', anim: 'walk' }], update: [{ kind: 'patrol', speed: 40 }], transitions: [{ to: 'lurch', when: { kind: 'player_within', px: 96 } }] },
    lurch: {
      onEnter: [{ kind: 'play_anim', anim: 'run' }],
      update: [{ kind: 'move_toward_player', speed: 76 }],
      transitions: [
        { to: 'claw', when: { kind: 'player_within', px: 30 } },
        { to: 'shamble', when: { kind: 'player_beyond', px: 192 } },
      ],
    },
    claw: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'claw' }], update: [], transitions: [{ to: 'lurch', when: { kind: 'timer_elapsed', ms: 740 } }] },
  },
};

export const HOUND: BehaviourFsm = {
  version: 1,
  id: 'hound',
  designNotes: 'Crouches, then coils and pounces at the player in a low leap, jaws first.',
  initial: 'crouch',
  states: {
    crouch: { onEnter: [{ kind: 'play_anim', anim: 'idle' }], update: [], transitions: [{ to: 'pounce', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 800 }, { kind: 'grounded' }, { kind: 'player_within', px: 160 }] } }] },
    pounce: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'pounce' }], update: [], transitions: [{ to: 'crouch', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 820 }, { kind: 'grounded' }] } }] },
  },
};

export const GARGOYLE: BehaviourFsm = {
  version: 1,
  id: 'gargoyle',
  designNotes: 'A stone watcher; wakes when the player comes into range, its eyes and maw blazing, and spits an ember at them; rests a beat between spits.',
  initial: 'stone',
  states: {
    stone: { onEnter: [{ kind: 'play_anim', anim: 'idle' }], update: [], transitions: [{ to: 'spit', when: { kind: 'player_within', px: 192 } }] },
    spit: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'aim' }], update: [], transitions: [{ to: 'watch', when: { kind: 'timer_elapsed', ms: 1200 } }] },
    watch: {
      onEnter: [{ kind: 'play_anim', anim: 'idle' }],
      update: [{ kind: 'move_toward_player', speed: 0 }],
      transitions: [
        { to: 'spit', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 500 }, { kind: 'player_within', px: 192 }] } },
        { to: 'stone', when: { kind: 'player_beyond', px: 256 } },
      ],
    },
  },
};

export const SENTINEL: BehaviourFsm = {
  version: 1,
  id: 'sentinel',
  designNotes: 'Holds its ground behind a tower shield, facing the player; advances on them shield first, and within reach draws its spear back and drives it out over the rim, baring its chest as it recovers.',
  initial: 'hold',
  states: {
    hold: { onEnter: [{ kind: 'play_anim', anim: 'idle' }], update: [{ kind: 'move_toward_player', speed: 0 }], transitions: [{ to: 'advance', when: { kind: 'player_within', px: 160 } }] },
    advance: {
      onEnter: [{ kind: 'play_anim', anim: 'walk' }],
      update: [{ kind: 'move_toward_player', speed: 28 }],
      transitions: [
        { to: 'lunge', when: { kind: 'player_within', px: 44 } },
        { to: 'hold', when: { kind: 'player_beyond', px: 224 } },
      ],
    },
    lunge: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'thrust' }], update: [], transitions: [{ to: 'advance', when: { kind: 'timer_elapsed', ms: 950 } }] },
  },
};

export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [GHOUL, HOUND, GARGOYLE, SENTINEL];
export const VOCAB = PLATFORMER_VOCAB;
