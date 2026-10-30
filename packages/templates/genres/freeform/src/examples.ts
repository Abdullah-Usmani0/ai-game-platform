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
  // Kiting alone does not last the minute on two lives: the swarm has to be thinned (measured: attack is needed,
  // random mashing and standing still never win).
  objectives: { version: 1, win: { mode: 'all', clauses: [{ kind: 'survive', seconds: 60 }] }, lose: [{ kind: 'lives', count: 2 }] },
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
};

export const EXAMPLES: readonly FreeformExample[] = [HIVE, HEIST, LANTERN, MOON];
