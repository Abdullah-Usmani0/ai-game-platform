import { DialogueFile, type EntityRoster, type FreeformGddFrontmatter, type FreeformSystemsJson, type Objectives } from '@gg/schemas';

/** A hand-made freeform game: what a player asked for, and the design, systems, roster and rules that answer it. */
export interface FreeformExample {
  id: string;
  prompt: string;
  gdd: FreeformGddFrontmatter;
  systems: FreeformSystemsJson;
  roster: EntityRoster;
  /** content/objectives.json, where the objectives decide the win. */
  objectives?: Objectives;
  /** Content files the idea decides, by key (a farm's crops: content/crops.json). */
  content?: Readonly<Record<string, unknown>>;
}

/** A survivors arena fought with a top-down action blade, won by holding out for a minute on two lives. */
export const HIVE: FreeformExample = {
  id: 'hive',
  prompt: 'A bee guarding its hive with its stinger, holding out against wasp swarms until the sun comes up.',
  gdd: {
    title: 'Hive Watch',
    genre: 'freeform',
    base: 'survivors',
    scopeTier: 'small',
    pillars: ['the swarm never lets up', 'every sting is aimed', 'hold out until dawn'],
    scope: { levels: 1, enemies: 2, items: 0, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 60, deathsPerLevel: 1 },
    verbs: ['move', 'dash', 'attack'],
    feedbackEvents: [
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['hitstop', 'flash', 'sfx'] },
      { event: 'death', channels: ['shake', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'survivors' },
    feelPreset: 'arena-melee',
    systems: [
      { id: 'movement-topdown', params: {} },
      { id: 'melee-attack', params: {} },
      { id: 'spawner', params: {} },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'The arena chasers are wasps; the brutes are hornets, half again as tough.',
    player: {},
    types: [
      { type: 'wasp', archetype: 'survivors:chaser', hp: 1 },
      { type: 'hornet', archetype: 'survivors:brute', hp: 1.5 },
    ],
  },
  // Two lives for the minute: the arena's kiter lasts it on dodging alone, losing one; the sting thins the swarm for
  // everyone who dodges less well (random mashing and standing still never win).
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'survive', seconds: 60 }] }, lose: [{ kind: 'lives', count: 2 }] },
  content: {
    // A yellow bee with feelers, a striped body and pale wings; orange wasps with clear wings and a dark band, and
    // rust hornets: the foes stay off the bee's yellow.
    sprites: {
      version: 1,
      sprites: [
        {
          type: '@player',
          base: 'hero-topdown',
          recolor: { hero: '#ffc93c', accent: '#f2a93b', garment: '#2e2118', rim: '#e6f3ff' },
          overlays: [
            { x: 0, y: 0, rows: ['_k____k_'] },
            { x: 1, y: 5, rows: ['444444', '......', '344443'] },
            { x: 0, y: 4, rows: ['Y......Y', 'V......V'], under: true },
            { anims: ['up-idle', 'up-run', 'up-attack', 'up-hurt'], x: 2, y: 5, rows: ['yYYy', 'vyyv'] },
          ],
        },
        {
          type: 'wasp',
          base: 'bat',
          recolor: { danger: '#ef7d22', rim: '#dff1ff' },
          overlays: [
            { x: 0, y: 0, rows: ['Y......Y', 'yY....Yy', 'vyY..Yyv'] },
            { x: 2, y: 5, rows: ['kkkk'] },
          ],
        },
        {
          type: 'hornet',
          base: 'brute',
          recolor: { danger: '#c8501e', rim: '#dff1ff' },
          overlays: [
            { x: 3, y: 0, rows: ['k....k'] },
            { x: 1, y: 8, rows: ['kkkkkkkkkk'] },
            { x: 0, y: 2, rows: ['yY........Yy', 'vy........yv'], under: true },
          ],
        },
      ],
    },
  },
};

/** Top-down action rooms cleared by a survivors auto-attack: the gun aims itself, the room-clear rule still holds. */
export const HEIST: FreeformExample = {
  id: 'heist',
  prompt: 'A robot burglar whose shoulder turret fires on its own, clearing guarded vault rooms one by one.',
  gdd: {
    title: 'Vault Runner',
    genre: 'freeform',
    base: 'topdown-action',
    scopeTier: 'small',
    pillars: ['the turret does the shooting', 'positioning is the skill', 'each vault opens only when cleared'],
    scope: { levels: 2, enemies: 2, items: 1, bosses: 0 },
    targets: { sessionMin: 6, levelTimeS: 90, deathsPerLevel: 2 },
    verbs: ['move', 'dash'],
    feedbackEvents: [
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['hitstop', 'shake', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'topdown-action' },
    feelPreset: 'room-melee',
    systems: [
      { id: 'movement-topdown', params: { dashInvuln: true } },
      { id: 'auto-attack', params: {} },
      { id: 'room-clear', params: {} },
      { id: 'pickups', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'Grunts are guards, archers are sentries firing darts, brutes are enforcers, the warden is the vault keeper; gems are power cells and the auto-attack drops data shards.',
    player: {},
    types: [
      { type: 'guard', archetype: 'topdown-action:grunt', hp: 1 },
      { type: 'sentry', archetype: 'topdown-action:archer', hp: 1 },
      { type: 'dart', archetype: 'topdown-action:arrow', hp: 1 },
      { type: 'enforcer', archetype: 'topdown-action:brute', hp: 1 },
      { type: 'keeper', archetype: 'topdown-action:warden', hp: 1 },
      { type: 'cell', archetype: 'topdown-action:gem', hp: 1 },
      { type: 'shard', archetype: 'survivors:xp', hp: 1 },
    ],
  },
  content: {
    // A steel robot in a teal shell with a lit visor, a chest lamp and a turret on its shoulder (teal, so it never reads
    // as the grey stone sentries); guards in blue with flat caps, a gold vault keeper, cyan cells and green data shards.
    sprites: {
      version: 1,
      sprites: [
        {
          type: '@player',
          base: 'hero-topdown',
          recolor: { hero: '#d3dce1', accent: '#1f8f7e', garment: '#27a892', rim: '#5ee0ff' },
          overlays: [
            { anims: ['down-idle', 'down-run', 'down-attack', 'down-hurt'], x: 1, y: 3, rows: ['kYkkYk'] },
            { anims: ['side-idle', 'side-run', 'side-attack', 'side-hurt'], x: 3, y: 3, rows: ['kkYkY'] },
            { x: 3, y: 6, rows: ['YY'] },
            { x: 5, y: 4, rows: ['.kk', 'kk.'] },
          ],
        },
        { type: 'guard', base: 'grunt', recolor: { secondary: '#3d5a9e' }, overlays: [{ x: 1, y: 0, rows: ['kkkkkk'] }] },
        { type: 'sentry', base: 'archer', recolor: { danger: '#ff3b3b', wood: '#3a3f58' } },
        { type: 'dart', base: 'arrow', recolor: { wood: '#ff6b6b' } },
        { type: 'enforcer', base: 'brute', recolor: { danger: '#a8432c' } },
        { type: 'keeper', base: 'warden', recolor: { danger: '#c9a227', accent: '#5ee0ff' } },
        { type: 'cell', base: 'gem', recolor: { accent: '#5ee0ff' } },
        { type: 'shard', base: 'crystal', recolor: { secondary: '#7bd389' } },
      ],
    },
  },
};

/** A platformer won by objectives: gather lanterns, then reach the exit, with three lives; spikes only hurt. */
export const LANTERN: FreeformExample = {
  id: 'lantern',
  prompt: 'A moth carrying lanterns home through a night forest: collect them on the way, and mind the frogs.',
  gdd: {
    title: 'Lantern Moth',
    genre: 'freeform',
    base: 'platformer',
    scopeTier: 'small',
    pillars: ['light the way home', 'every jump is readable', 'three lives, no shortcuts'],
    scope: { levels: 3, enemies: 2, items: 1, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 45, deathsPerLevel: 2 },
    verbs: ['run', 'jump', 'dash', 'stomp'],
    feedbackEvents: [
      { event: 'jump', channels: ['sfx'] },
      { event: 'land', channels: ['sfx'] },
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx', 'particle'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'platformer' },
    feelPreset: 'celeste-class',
    systems: [
      { id: 'movement-platformer', params: {} },
      { id: 'hazards', params: {} },
      { id: 'combat-stomp', params: {} },
      { id: 'pickups', params: {} },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'Coins are lanterns; walkers are beetles, hoppers are frogs, turrets are spore pods firing spores.',
    player: {},
    types: [
      { type: 'lantern', archetype: 'platformer:coin', hp: 1 },
      { type: 'beetle', archetype: 'platformer:walker', hp: 1 },
      { type: 'frog', archetype: 'platformer:hopper', hp: 1 },
      { type: 'pod', archetype: 'platformer:turret', hp: 1 },
      { type: 'spore', archetype: 'platformer:bolt', hp: 1 },
    ],
  },
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'collect', type: 'lantern', count: 2 }, { kind: 'reach_goal' }] }, lose: [{ kind: 'lives', count: 3 }] },
  content: {
    // A pale moth with lilac fuzz, feelers and a wing at its back; warm lanterns with a dark cap and base, teal beetles,
    // green frogs and pale green spores.
    sprites: {
      version: 1,
      sprites: [
        {
          type: '@player',
          base: 'hero-side',
          recolor: { hero: '#eadfc8', accent: '#c9b2e6', garment: '#7a68a6', rim: '#f3e9ff' },
          overlays: [
            { x: 3, y: 0, rows: ['_k_k_'] },
            { x: 0, y: 5, rows: ['Yy', 'yV', 'V.'], under: true },
          ],
        },
        {
          type: 'lantern',
          base: 'coin',
          recolor: { accent: '#ffb347' },
          overlays: [
            { x: 1, y: 0, rows: ['_kk_'] },
            { x: 1, y: 5, rows: ['kkkk'] },
          ],
        },
        { type: 'beetle', base: 'walker', recolor: { danger: '#2f7f6a' }, overlays: [{ x: 6, y: 0, rows: ['k.', '.k'] }] },
        { type: 'frog', base: 'hopper', recolor: { secondary: '#5dbb63' } },
        { type: 'spore', base: 'orb', recolor: { danger: '#b8f26b' } },
      ],
    },
  },
};

/** The cozy farm's systems under another sky: a moth's moon garden, every farm thing renamed, the season won by the purse. */
export const MOON: FreeformExample = {
  id: 'moon',
  prompt: "A moth keeping a moon garden: sow glowcaps in the moonbeds, leave the harvest in the offering chest, buy spores at the beetle's stall.",
  gdd: {
    title: 'Moon Garden',
    genre: 'freeform',
    base: 'lifesim',
    scopeTier: 'small',
    pillars: ['every night ends with something grown', 'the garden is a plan, never a chore', 'the moon pays the patient'],
    scope: { levels: 2, enemies: 0, items: 0, bosses: 0 },
    targets: { sessionMin: 15, levelTimeS: 300, deathsPerLevel: 0 },
    verbs: ['move', 'work', 'choose seed'],
    feedbackEvents: [
      { event: 'pickup', channels: ['particle', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'lifesim' },
    feelPreset: 'farm-stroll',
    systems: [
      { id: 'movement-topdown', params: { dash: false, cornerSlip: 3 } },
      { id: 'day-clock', params: {} },
      { id: 'farming', params: {} },
      { id: 'shipping', params: {} },
      { id: 'season', params: {} },
      { id: 'shop', params: {} },
      { id: 'sleep', params: {} },
      { id: 'energy', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: "Plots are moonbeds and what grows in them glowcaps; the shipping bin is the offering chest, the stall a beetle's, the bed a hollow in the old oak.",
    player: {},
    types: [
      { type: 'moonbed', archetype: 'lifesim:plot', hp: 1 },
      { type: 'glowcap', archetype: 'lifesim:crop', hp: 1 },
      { type: 'offering', archetype: 'lifesim:bin', hp: 1 },
      { type: 'beetle_stall', archetype: 'lifesim:shop', hp: 1 },
      { type: 'hollow', archetype: 'lifesim:bed', hp: 1 },
    ],
  },
  // What grows by moonlight: glowcaps, quick and cheap to start on; dew-heavy leaves; berries that ripen night after
  // night once they bear; and a slow lily worth the wait.
  content: {
    crops: {
      version: 1,
      crops: [
        { id: 'glowcap', name: 'Glowcap', seedPrice: 10, sellPrice: 30, growDays: 2, look: { shape: 'root', color: '#a9dcff' } },
        { id: 'dewleaf', name: 'Dewleaf', seedPrice: 20, sellPrice: 65, growDays: 3, look: { shape: 'leafy', color: '#7fe0b8' } },
        { id: 'starberry', name: 'Starberry', seedPrice: 45, sellPrice: 35, growDays: 4, regrowDays: 1, look: { shape: 'bush', color: '#ffd75e' } },
        { id: 'nightlily', name: 'Nightlily', seedPrice: 50, sellPrice: 175, growDays: 5, look: { shape: 'tall', color: '#c59bff' } },
      ],
    },
    // The moth keeper in lilac with feelers for a hat and pale wings; blue-grey moonbeds, a moonwood offering chest
    // with a glowing latch, the beetle's stall under a violet awning, the hollow in dark bark.
    sprites: {
      version: 1,
      sprites: [
        {
          type: '@player',
          base: 'farmer',
          recolor: { hero: '#eadfc8', accent: '#c9b2e6', garment: '#7a68a6', rim: '#f3e9ff' },
          overlays: [
            { x: 0, y: 0, rows: ['_k____k_', '__k__k__'] },
            { anims: ['down-idle', 'down-run', 'down-attack', 'down-hurt'], x: 0, y: 4, rows: ['Y......Y', 'V......V'], under: true },
            { anims: ['up-idle', 'up-run', 'up-attack', 'up-hurt'], x: 1, y: 5, rows: ['yYYYYy', 'VyVVyV'] },
            { anims: ['side-idle', 'side-run', 'side-attack', 'side-hurt'], x: 0, y: 4, rows: ['Y', 'yY', 'V'], under: true },
          ],
        },
        { type: 'moonbed', base: 'plot', recolor: { wood: '#4b4a6b' } },
        { type: 'offering', base: 'bin', recolor: { wood: '#6d5a8f', accent: '#a9dcff' } },
        { type: 'beetle_stall', base: 'stall', recolor: { accent: '#7c5cbf' } },
        { type: 'hollow', base: 'door-front', recolor: { wood: '#5b4636' } },
      ],
    },
  },
};

/**
 * A runner on the platformer: the courier never stops, so every leap is timed on the move; its levels run as long as the
 * level time at its pace, a little faster as each goes on.
 */
export const ROOFTOP: FreeformExample = {
  id: 'rooftop',
  prompt: 'A fox courier running across the city rooftops at dusk without ever stopping: leap the gaps, bounce on the rats and grab the letters on the way.',
  gdd: {
    title: 'Rooftop Courier',
    genre: 'freeform',
    base: 'platformer',
    scopeTier: 'small',
    pillars: ['never stop running', 'every leap is timed on the move', 'the letters lie on the way'],
    scope: { levels: 3, enemies: 2, items: 1, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 30, deathsPerLevel: 2 },
    verbs: ['jump', 'dash', 'stomp'],
    feedbackEvents: [
      { event: 'jump', channels: ['sfx'] },
      { event: 'land', channels: ['sfx'] },
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx', 'particle'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'platformer' },
    feelPreset: 'celeste-class',
    systems: [
      { id: 'movement-platformer', params: {} },
      { id: 'auto-run', params: { rampPerMin: 0.3 } },
      { id: 'hazards', params: {} },
      { id: 'combat-stomp', params: {} },
      { id: 'pickups', params: {} },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'Coins are letters; walkers are rats, hoppers are alley cats, turrets are chimney pots spitting sparks.',
    player: {},
    types: [
      { type: 'letter', archetype: 'platformer:coin', hp: 1 },
      { type: 'rat', archetype: 'platformer:walker', hp: 1 },
      { type: 'cat', archetype: 'platformer:hopper', hp: 1 },
      { type: 'chimney', archetype: 'platformer:turret', hp: 1 },
      { type: 'spark', archetype: 'platformer:bolt', hp: 1 },
    ],
  },
  // The letters score; the last roof wins, on three lives a level.
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'reach_goal' }] }, lose: [{ kind: 'lives', count: 3 }] },
  content: {
    // An orange fox with pointed ears, a white muzzle and tail tip, a green courier jacket and a satchel strap; cream
    // letters with a red seal, grey rats with a pink ear and tail, dusk-purple alley cats, slate chimney pots spitting
    // lime sparks: no foe in the fox's orange or its jacket's green, in any of the sample palettes.
    sprites: {
      version: 1,
      sprites: [
        {
          type: '@player',
          base: 'hero-side',
          recolor: { hero: '#e58a45', accent: '#c4552a', garment: '#3e7b52', rim: '#fff1de', wood: '#7a4a2a' },
          overlays: [
            { x: 2, y: 0, rows: ['_a__a_'] },
            { x: 6, y: 4, rows: ['yy'] },
            { x: 0, y: 7, rows: ['Y.', 'AA'], under: true },
            { x: 3, y: 7, rows: ['p..'] },
          ],
        },
        { type: 'letter', base: 'coin', recolor: { accent: '#efe3c4' }, overlays: [{ x: 0, y: 1, rows: ['a....a', '.a..a.', '..dd..'] }] },
        {
          type: 'rat',
          base: 'walker',
          recolor: { danger: '#8d8a96', secondary: '#e08aa0' },
          overlays: [
            { x: 5, y: 0, rows: ['N'] },
            { x: 0, y: 2, rows: ['m', 'm'], under: true },
          ],
        },
        { type: 'cat', base: 'hopper', recolor: { secondary: '#5b4f7a' }, overlays: [{ x: 1, y: 2, rows: ['N....N'] }] },
        { type: 'chimney', base: 'turret', recolor: { danger: '#7d8597' } },
        { type: 'spark', base: 'orb', recolor: { danger: '#c6f25c' } },
      ],
    },
  },
};

/**
 * A survivors arena held with the shmup's gun, aimed for the player: every squirt flies at the nearest pest, one key to
 * fire, the arrows free to keep away.
 */
export const GNOME: FreeformExample = {
  id: 'gnome',
  prompt: 'A garden gnome guarding the vegetable patch from waves of slugs and beetles, a water pistol squirting the nearest pest, until sundown.',
  gdd: {
    title: 'Gnome Guard',
    genre: 'freeform',
    base: 'survivors',
    scopeTier: 'small',
    pillars: ['the pistol finds the pest, you find the room', 'keep moving or be cornered', 'hold the patch until sundown'],
    scope: { levels: 1, enemies: 2, items: 0, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 45, deathsPerLevel: 1 },
    verbs: ['move', 'dash', 'shoot'],
    feedbackEvents: [
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['hitstop', 'flash', 'sfx'] },
      { event: 'death', channels: ['shake', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'survivors' },
    feelPreset: 'arena-melee',
    systems: [
      { id: 'movement-topdown', params: {} },
      { id: 'player-shooter', params: { aim: 'nearest', fireCooldownTicks: 10 } },
      { id: 'spawner', params: {} },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'The arena chasers are slugs, the brutes are beetles; the shot is a squirt of water.',
    player: {},
    types: [
      { type: 'slug', archetype: 'survivors:chaser', hp: 1 },
      { type: 'beetle', archetype: 'survivors:brute', hp: 1 },
      { type: 'squirt', archetype: 'shmup:shot', hp: 1 },
    ],
  },
  // Dodging alone never wins: sundown also takes twenty squashed pests (measured: the arena's kiter, which never fires,
  // runs out of lives; the explorer squashes 26 to 28 in the 45 s; standing still and mashing never win).
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'survive', seconds: 45 }, { kind: 'defeat', count: 20 }] }, lose: [{ kind: 'lives', count: 2 }] },
  content: {
    // A gnome in a red pointed hat, a white beard and a blue tunic; tan slugs on eye stalks, violet beetles with
    // feelers, and a blue squirt of water.
    sprites: {
      version: 1,
      sprites: [
        {
          type: '@player',
          base: 'hero-topdown',
          recolor: { hero: '#f2c29a', accent: '#d8373a', garment: '#3d6fc8', rim: '#f4f1ea' },
          overlays: [
            { x: 2, y: 0, rows: ['_..__'] },
            { anims: ['down-idle', 'down-run', 'down-attack', 'down-hurt'], x: 1, y: 4, rows: ['yYYYYy', '.yYYy.'] },
            { anims: ['side-idle', 'side-run', 'side-attack', 'side-hurt'], x: 4, y: 4, rows: ['YYYy', 'yYy.'] },
          ],
        },
        { type: 'slug', base: 'drone', recolor: { danger: '#d9a441' }, overlays: [{ x: 2, y: 0, rows: ['k..k'] }] },
        { type: 'beetle', base: 'brute', recolor: { danger: '#5b4bb3' }, overlays: [{ x: 2, y: 0, rows: ['kk....kk'] }] },
        { type: 'squirt', base: 'laser', recolor: { accent: '#5ab8ff' } },
      ],
    },
  },
};

/** A tea room on the survivors' arena: a cat waiter carrying tea from the kitchen to tables that order in turn. */
export const TEAROOM: FreeformExample = {
  id: 'tearoom',
  prompt: 'A cat waiter in a garden tea house at the afternoon rush: carry the tea from the kitchen to each table before the customer gives up and leaves.',
  gdd: {
    title: 'Tea Room Rush',
    genre: 'freeform',
    base: 'survivors',
    scopeTier: 'small',
    pillars: ['every table is waiting on you', 'the next order is already ringing', 'three walkouts and the afternoon is lost'],
    scope: { levels: 1, enemies: 0, items: 1, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 60, deathsPerLevel: 1 },
    verbs: ['move', 'carry', 'serve'],
    feedbackEvents: [
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['shake', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'survivors' },
    feelPreset: 'arena-melee',
    systems: [
      { id: 'movement-topdown', params: {} },
      { id: 'carry', params: { dropoffs: 4 } },
      { id: 'orders', params: { everyS: 5, patienceS: 14, maxOpen: 3 } },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'The cargo is a cup of tea, the source is the kitchen counter, the dropoffs are the garden tables.',
    player: { hp: 3 },
    types: [
      { type: 'tea', archetype: 'carry:cargo', hp: 1 },
      { type: 'table', archetype: 'carry:dropoff', hp: 1 },
      { type: 'kitchen', archetype: 'carry:source', hp: 1 },
    ],
  },
  // Twelve served before three customers walk out; each walkout costs one of the cat's three hearts.
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'hud_at_least', key: 'delivered', value: 12 }] }, lose: [{ kind: 'lives', count: 1 }] },
  content: {
    // A grey tabby with its ears up in a navy waistcoat over a white shirt, its face the palette's own (a face of its
    // own shades its boots red-orange, the base's chasers' colour in the darker palettes); tea in a rose-banded cup;
    // tables and the kitchen counter in warm wood whatever the palette, the customers in blue.
    sprites: {
      version: 1,
      sprites: [
        {
          type: '@player',
          base: 'hero-topdown',
          recolor: { accent: '#9aa0ab', garment: '#2c3a5e' },
          overlays: [
            { anims: ['down-idle', 'down-run', 'down-attack', 'down-hurt', 'up-idle', 'up-run', 'up-attack', 'up-hurt'], x: 1, y: 0, rows: ['aa__bb'] },
            { anims: ['side-idle', 'side-run', 'side-attack', 'side-hurt'], x: 2, y: 0, rows: ['a_Ab'] },
            { anims: ['down-idle', 'down-run', 'down-attack', 'down-hurt'], x: 3, y: 5, rows: ['ww'] },
          ],
        },
        { type: 'tea', base: 'cup', recolor: { accent: '#c8577a' } },
        { type: 'table', base: 'table', recolor: { wood: '#a0683a', secondary: '#5f86c9' } },
        { type: 'kitchen', base: 'counter', recolor: { wood: '#a0683a' } },
      ],
    },
  },
};

/** A lighthouse keeper's cliff path on the platformer: oil from the cellar to the lamp, every time it asks, all night. */
export const LIGHTHOUSE: FreeformExample = {
  id: 'lighthouse',
  prompt: 'A lighthouse keeper on a stormy night: carry oil up from the cellar to keep the lamp lit, leaping the gaps in the cliff path and the crabs on it.',
  gdd: {
    title: 'Keeper of the Lamp',
    genre: 'freeform',
    base: 'platformer',
    scopeTier: 'small',
    pillars: ['the lamp must not go out', 'the cliff path bites back', 'every can counts'],
    scope: { levels: 3, enemies: 2, items: 1, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 75, deathsPerLevel: 2 },
    verbs: ['jump', 'stomp', 'carry'],
    feedbackEvents: [
      { event: 'jump', channels: ['sfx'] },
      { event: 'land', channels: ['sfx'] },
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx', 'particle'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'platformer' },
    feelPreset: 'celeste-class',
    systems: [
      { id: 'movement-platformer', params: {} },
      { id: 'hazards', params: {} },
      { id: 'combat-stomp', params: {} },
      { id: 'pickups', params: {} },
      { id: 'carry', params: { dropoffs: 1 } },
      { id: 'orders', params: { patienceS: 20, everyS: 10, maxOpen: 1, missDamage: 3 } },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'Oil in a can from the cellar barrel to the lamp; walkers are crabs, hoppers are gulls, turrets are sea urchins spitting spines, coins are shells.',
    player: { hp: 3 },
    types: [
      { type: 'oil', archetype: 'carry:cargo', hp: 1 },
      { type: 'lamp', archetype: 'carry:dropoff', hp: 1 },
      { type: 'cellar', archetype: 'carry:source', hp: 1 },
      { type: 'crab', archetype: 'platformer:walker', hp: 1 },
      { type: 'gull', archetype: 'platformer:hopper', hp: 1 },
      { type: 'urchin', archetype: 'platformer:turret', hp: 1 },
      { type: 'spine', archetype: 'platformer:bolt', hp: 1 },
      { type: 'shell', archetype: 'platformer:coin', hp: 1 },
    ],
  },
  // The night is 75 s on three lives; a lamp left to go out costs a whole life (three hearts), so standing still loses
  // the third life near 68 s.
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'survive', seconds: 75 }] }, lose: [{ kind: 'lives', count: 3 }] },
  content: {
    // The keeper in yellow oilskins; a red oil can; a red-orange crab, a slate-grey gull (a white one would wear the
    // oilskins' highlights in the paler palettes), a violet urchin and its spines, and pink shells.
    sprites: {
      version: 1,
      sprites: [
        { type: '@player', base: 'hero-side', recolor: { accent: '#e7b52c', garment: '#e7b52c' } },
        { type: 'oil', base: 'can', recolor: { secondary: '#c4473a' } },
        { type: 'lamp', base: 'lamp' },
        { type: 'cellar', base: 'barrel' },
        { type: 'crab', base: 'walker', recolor: { danger: '#d9583b' } },
        { type: 'gull', base: 'hopper', recolor: { secondary: '#8c99a6' } },
        { type: 'urchin', base: 'turret', recolor: { danger: '#7a4fb5' } },
        { type: 'shell', base: 'coin', recolor: { accent: '#f2a7b8' } },
      ],
    },
  },
};

/**
 * A lost dog on the top-down action base, told by the people of a village: in the first wood the baker saw which way it
 * ran and an elder warns of wolves; by the stream a child saw it cross and a traveller found it asleep under his cart.
 * Asking starts the search (a quest); a wolf beaten is remembered (a deed, which the elder hears of); the dog found or
 * not decides how the day ends.
 */
export const LOSTDOG: FreeformExample = {
  id: 'lostdog',
  prompt: 'A kid searching the woods for their lost dog before dark: ask the villagers which way it went, clear the wolves off the path with a wooden sword, and bring it home.',
  gdd: {
    title: "Bramble's Trail",
    genre: 'freeform',
    base: 'topdown-action',
    scopeTier: 'small',
    pillars: ['ask everyone you meet', 'the woods bite back', 'bring Bramble home before dark'],
    scope: { levels: 2, enemies: 2, items: 1, bosses: 0 },
    targets: { sessionMin: 8, levelTimeS: 90, deathsPerLevel: 2 },
    verbs: ['move', 'dash', 'attack', 'talk'],
    feedbackEvents: [
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['hitstop', 'shake', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'topdown-action' },
    feelPreset: 'room-melee',
    systems: [
      { id: 'movement-topdown', params: {} },
      { id: 'melee-attack', params: {} },
      { id: 'room-clear', params: {} },
      { id: 'pickups', params: {} },
      // The stick swings on action and dash dodges: jump is free to talk with.
      { id: 'talk', params: { key: 'jump' } },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'Grunts are wolves, archers are crows throwing burrs, brutes are boars; gems are biscuits that mend a scrape; the people are villagers.',
    player: {},
    types: [
      { type: 'wolf', archetype: 'topdown-action:grunt', hp: 1 },
      { type: 'crow', archetype: 'topdown-action:archer', hp: 1 },
      { type: 'burr', archetype: 'topdown-action:arrow', hp: 1 },
      { type: 'boar', archetype: 'topdown-action:brute', hp: 1 },
      { type: 'biscuit', archetype: 'topdown-action:gem', hp: 1 },
      { type: 'villager', archetype: 'talk:person', hp: 1 },
    ],
  },
  content: {
    dialogue: {
      version: 1,
      names: { baker: 'Mrs. Hollin', elder: 'Old Ansel', child: 'Pip', traveller: 'The Tinker' },
      nodes: [
        { id: 'prologue', speaker: 'narrator', lines: ['The gate was open. The lead hung on its hook.', 'Bramble was gone, and the sun was already low.'] },
        { id: 'baker', speaker: 'baker', lines: ['Bramble? Shot past my window after a crow, ears flapping.', 'Off toward the old orchard, I think. Will you go after her?'], choices: [{ label: "I'll find her", to: 'baker-go', set: { searching: true } }, { label: 'She always comes back', to: 'baker-wait' }] },
        { id: 'baker-go', speaker: 'baker', lines: ['Take a biscuit, then. Dogs never say no to one.'] },
        { id: 'baker-wait', speaker: 'baker', lines: ['Not in the dark, she won\'t. Wolves come down this time of year.'], next: 'baker-ask' },
        { id: 'baker-ask', speaker: 'baker', lines: ['Go on. I\'ll keep a lamp in the window.'], set: { searching: true } },
        { id: 'baker-again', speaker: 'baker', lines: ['Still looking? The orchard, love. Past the crows.'] },
        { id: 'elder', speaker: 'elder', lines: ['Wolves in the orchard, child. Keep your stick up and your feet quick.'] },
        { id: 'elder-brave', speaker: 'elder', lines: ['You stood up to a wolf? Ha! Your gran did the same, once.', 'The stream is that way. Dogs go for water when they are lost.'] },
        { id: 'child', speaker: 'child', lines: ['A brown dog with one white ear? She went over the stepping stones!', 'She looked muddy. And happy.'] },
        { id: 'traveller', speaker: 'traveller', lines: ['A dog? There is one asleep under my cart, snoring like a kettle.', 'One white ear. Yours, is she?'], choices: [{ label: 'Bramble!', to: 'found', set: { found: true } }] },
        { id: 'found', speaker: 'traveller', lines: ['Go on home, the both of you. It is nearly dark.'] },
        { id: 'end-home', speaker: 'narrator', lines: ['Bramble trotted home at your heels, tail high, as the lamps came on.', 'Mrs. Hollin had kept a biscuit back. Of course she had.'] },
        { id: 'end-alone', speaker: 'narrator', lines: ['You came home at dusk with an empty lead.', 'In the morning there was a muddy dog asleep on the step.'] },
      ],
      starts: [
        { speaker: 'baker', node: 'baker-again', when: [{ flag: 'searching', is: true }] },
        { speaker: 'baker', node: 'baker' },
        { speaker: 'elder', node: 'elder-brave', when: [{ flag: 'brave', is: true }] },
        { speaker: 'elder', node: 'elder' },
        { speaker: 'child', node: 'child' },
        { speaker: 'traveller', node: 'traveller' },
      ],
      chapters: [
        { level: 1, title: 'The Open Gate', node: 'prologue' },
        { level: 2, title: 'The Stepping Stones' },
      ],
      endings: [
        { id: 'home', title: 'Home Together', when: [{ flag: 'found', is: true }], node: 'end-home' },
        { id: 'alone', title: 'An Empty Lead', node: 'end-alone' },
      ],
      quests: [{ id: 'bramble', title: 'Find Bramble', start: [{ flag: 'searching', is: true }], done: [{ flag: 'found', is: true }] }],
      deeds: [{ on: 'death', type: 'wolf', set: { brave: true } }],
      people: [
        { speaker: 'baker', level: 1, near: 'start', look: 0 },
        { speaker: 'elder', level: 1, near: 'end', look: 1 },
        { speaker: 'child', level: 2, near: 'start', look: 2 },
        { speaker: 'traveller', level: 2, near: 'end', look: 3 },
      ],
    },
    // A brown-haired kid in a blue scarf; grey wolves, black crows with green burrs, golden biscuits; the boar as it
    // ships, in the danger colours (no foe in the kid's colours, nor the kid in the warden's embers').
    sprites: {
      version: 1,
      sprites: [
        { type: '@player', base: 'hero-topdown', recolor: { accent: '#7a4a2a', garment: '#3d6fc4' } },
        { type: 'wolf', base: 'grunt', recolor: { secondary: '#6f7480' } },
        { type: 'crow', base: 'archer', recolor: { danger: '#2a2633', wood: '#3a3f58' } },
        { type: 'burr', base: 'arrow', recolor: { wood: '#7bd389' } },
        { type: 'biscuit', base: 'gem', recolor: { accent: '#e0a84a' } },
      ],
    },
  },
};

/**
 * A courier on a bike in a market square: the tea room's job (carry and timed orders) on wheels. The bike corners on
 * rails but cannot stop on a sixpence: ten parcels delivered before three customers give up waiting.
 */
export const PARCEL: FreeformExample = {
  id: 'parcel',
  prompt: 'A courier on a bike racing parcels from the depot to doorsteps round the market square, before each customer gives up waiting.',
  gdd: {
    title: 'Parcel Dash',
    genre: 'freeform',
    base: 'survivors',
    scopeTier: 'small',
    pillars: ['every doorstep is waiting on you', 'the bike corners on rails, the square does not move', 'ten delivered before three give up'],
    scope: { levels: 1, enemies: 0, items: 1, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 75, deathsPerLevel: 1 },
    verbs: ['move', 'dash', 'carry'],
    feedbackEvents: [
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['shake', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'survivors' },
    feelPreset: 'arena-melee',
    systems: [
      { id: 'movement-vehicle', params: { kind: 'bike', boost: true } },
      { id: 'carry', params: { dropoffs: 4 } },
      { id: 'orders', params: { everyS: 6, patienceS: 20, maxOpen: 2 } },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: 'The cargo is a parcel, the source is the depot counter, the dropoffs are the doorsteps round the square.',
    player: { hp: 3 },
    types: [
      { type: 'parcel', archetype: 'carry:cargo', hp: 1 },
      { type: 'doorstep', archetype: 'carry:dropoff', hp: 1 },
      { type: 'depot', archetype: 'carry:source', hp: 1 },
    ],
  },
  // Ten delivered before three customers give up; each one who does costs one of the courier's three hearts.
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'hud_at_least', key: 'delivered', value: 10 }] }, lose: [{ kind: 'lives', count: 1 }] },
};

/**
 * A galleon holding a bay against raiders: the survivors arena at sea, sailed rather than walked, its guns bearing only
 * abeam. The sloops close to ram; a broadside sinks them. A minute on three lives.
 */
export const BROADSIDE: FreeformExample = {
  id: 'broadside',
  prompt: 'A pirate galleon holding the bay against raiders: sail round the islets and sink their ships with broadsides until the raiding fleet turns back.',
  gdd: {
    title: 'Broadside',
    genre: 'freeform',
    base: 'survivors',
    scopeTier: 'small',
    pillars: ['the guns bear only abeam', 'a galleon turns slow and drifts wide', 'hold the bay until the fleet turns back'],
    scope: { levels: 1, enemies: 1, items: 0, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 60, deathsPerLevel: 1 },
    verbs: ['move', 'shoot'],
    feedbackEvents: [
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['shake', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
  },
  systems: {
    version: 1,
    genre: 'freeform',
    composition: { base: 'survivors' },
    feelPreset: 'arena-melee',
    systems: [
      { id: 'movement-vehicle', params: { kind: 'galleon' } },
      { id: 'player-shooter', params: { aim: 'broadside', fireCooldownTicks: 24, spread: 2, range: 110 } },
      { id: 'spawner', params: {} },
      { id: 'objectives', params: {} },
    ],
  },
  roster: {
    version: 1,
    designNotes: "The raiders are sloops (the vehicle block's own foe at sea); the shots are cannonballs.",
    player: { hp: 3 },
    types: [
      { type: 'raider', archetype: 'movement-vehicle:sloop', hp: 1 },
      { type: 'cannonball', archetype: 'shmup:shot', hp: 1 },
    ],
  },
  // A minute on three lives, against the base's waves: the raiders are the game's first foe, so they come in them.
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'survive', seconds: 60 }] }, lose: [{ kind: 'lives', count: 3 }] },
};

export const EXAMPLES: readonly FreeformExample[] = [HIVE, HEIST, LANTERN, MOON, ROOFTOP, GNOME, TEAROOM, LIGHTHOUSE, LOSTDOG, PARCEL, BROADSIDE];

/** An example's talk (content/dialogue.json), if it tells a story: who its levels place, among the rest. */
export function exampleStory(ex: FreeformExample): DialogueFile | null {
  const d = DialogueFile.safeParse(ex.content?.['dialogue']);
  return d.success ? d.data : null;
}
