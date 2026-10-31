import type { BehaviourFsm, Condition, LeafCondition } from '@gg/schemas';
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

export const WRAITH: BehaviourFsm = {
  version: 1,
  id: 'wraith',
  designNotes: 'Drifts toward the player at its own height; within reach raises its hands and casts a slow hex at them, then fades, drifting on through them unseen, and gathers again on the far side.',
  initial: 'drift',
  states: {
    drift: { onEnter: [{ kind: 'play_anim', anim: 'idle' }], update: [{ kind: 'move_toward_player', speed: 24 }], transitions: [{ to: 'cast', when: { kind: 'player_within', px: 176 } }] },
    cast: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'cast' }], update: [], transitions: [{ to: 'fade', when: { kind: 'timer_elapsed', ms: 1140 } }] },
    fade: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'fade' }], update: [], transitions: [{ to: 'drift', when: { kind: 'timer_elapsed', ms: 690 } }] },
  },
};

export const ARCHER: BehaviourFsm = {
  version: 1,
  id: 'bone-archer',
  designNotes: 'Patrols its floor; within range draws an arrow back to its jaw and looses it low at the player, then backs away to draw again, standing its ground at a ledge or a wall.',
  initial: 'patrol',
  states: {
    patrol: { onEnter: [{ kind: 'play_anim', anim: 'walk' }], update: [{ kind: 'patrol', speed: 26 }], transitions: [{ to: 'draw', when: { kind: 'all', of: [{ kind: 'player_within', px: 224 }, { kind: 'grounded' }] } }] },
    draw: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'draw' }], update: [], transitions: [{ to: 'back', when: { kind: 'timer_elapsed', ms: 1100 } }] },
    back: {
      onEnter: [{ kind: 'play_anim', anim: 'walk' }],
      update: [{ kind: 'move_away_from_player', speed: 40 }],
      transitions: [
        { to: 'draw', when: { kind: 'any', of: [{ kind: 'at_ledge' }, { kind: 'hit_wall' }] } },
        { to: 'draw', when: { kind: 'all', of: [{ kind: 'timer_elapsed', ms: 700 }, { kind: 'player_within', px: 224 }] } },
        { to: 'patrol', when: { kind: 'player_beyond', px: 288 } },
      ],
    },
  },
};

/** A transition's condition: a state's timer, and with it another test. */
const after = (ms: number, also?: LeafCondition): Condition => (also ? { kind: 'all', of: [{ kind: 'timer_elapsed', ms }, also] } : { kind: 'timer_elapsed', ms });

export const HEADSMAN: BehaviourFsm = {
  version: 1,
  id: 'headsman',
  designNotes: 'Kneels over its cleaver until the hero comes near, rises, and fights: chops at a hero in reach, leaps at one who keeps away, drags its cleaver to send a wave along the floor; at half health it roars and fights faster, a sweeping two-blow combo in place of the chop.',
  initial: 'dormant',
  states: {
    dormant: { onEnter: [{ kind: 'play_anim', anim: 'kneel' }], update: [], transitions: [{ to: 'rise', when: { kind: 'player_within', px: 200 } }] },
    rise: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'rise' }, { kind: 'emit', event: 'custom:boss' }], update: [], transitions: [{ to: 'watch', when: after(1020) }] },
    watch: {
      onEnter: [{ kind: 'play_anim', anim: 'walk' }],
      update: [{ kind: 'move_toward_player', speed: 34 }],
      transitions: [
        { to: 'roar', when: { kind: 'all', of: [{ kind: 'hp_below', fraction: 0.5 }, { kind: 'flag', name: 'enraged', is: false }] } },
        { to: 'chop', when: after(500, { kind: 'player_within', px: 76 }) },
        { to: 'leap', when: after(700, { kind: 'player_beyond', px: 150 }) },
        { to: 'drag', when: after(900, { kind: 'chance', p: 0.03 }) },
      ],
    },
    chop: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'chop' }], update: [], transitions: [{ to: 'watch', when: after(1120) }] },
    leap: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'leap' }], update: [], transitions: [{ to: 'watch', when: after(1550, { kind: 'grounded' }) }] },
    drag: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'drag' }], update: [], transitions: [{ to: 'watch', when: after(1170) }] },
    roar: {
      onEnter: [{ kind: 'set_flag', name: 'enraged', value: true }, { kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'roar' }, { kind: 'emit', event: 'custom:enrage' }],
      update: [],
      transitions: [{ to: 'fury', when: after(1190) }],
    },
    fury: {
      onEnter: [{ kind: 'play_anim', anim: 'walk' }],
      update: [{ kind: 'move_toward_player', speed: 50 }],
      transitions: [
        { to: 'combo', when: after(300, { kind: 'player_within', px: 84 }) },
        { to: 'leap2', when: after(400, { kind: 'player_beyond', px: 140 }) },
        { to: 'drag2', when: after(500, { kind: 'chance', p: 0.05 }) },
      ],
    },
    combo: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'combo' }], update: [], transitions: [{ to: 'fury', when: after(1120) }] },
    leap2: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'leap' }], update: [], transitions: [{ to: 'fury', when: after(1550, { kind: 'grounded' }) }] },
    drag2: { onEnter: [{ kind: 'move_toward_player', speed: 0 }, { kind: 'play_anim', anim: 'drag' }], update: [], transitions: [{ to: 'fury', when: after(1170) }] },
  },
};

export const DEFAULT_BEHAVIOURS: BehaviourFsm[] = [GHOUL, HOUND, GARGOYLE, SENTINEL, WRAITH, ARCHER, HEADSMAN];
export const VOCAB = PLATFORMER_VOCAB;
