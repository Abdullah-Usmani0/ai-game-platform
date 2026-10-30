import type { EntityRoster, FreeformGddFrontmatter, FreeformSystemsJson, Objectives } from '@gg/schemas';

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

export const EXAMPLES: readonly FreeformExample[] = [HIVE, HEIST, LANTERN, MOON, ROOFTOP, GNOME];
