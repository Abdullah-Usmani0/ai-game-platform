import { mix, ramp, type RGB } from './color.js';
import type { ArtPalette } from './palette.js';
import { PixelCanvas, type Legend, type Template } from './pixels.js';

/**
 * Entity sprites: hand-made pixel templates per animation, recoloured from the game's palette and outlined in the
 * style card's mode. A template character names a palette slot; every sprite shares the same slot letters:
 *
 *   k ink        w white      1-5 hero ramp (dark to light)      a A b B accent (shadow, base, light, glint)
 *   x d D e E danger (darkest to light)   t T u U terrain/metal   p q Q r R wood   i I ui
 *   m M n N secondary hue (between danger and accent)   g G h H the hero's garment (opposite the danger hue)
 */

export type Anchor = 'feet' | 'center';

export interface Recipe {
  /** Frames per animation; every frame of a recipe has the same size. */
  anims: Readonly<Record<string, readonly Template[]>>;
  anchor: Anchor;
  /** Override slot colours (for example a hopper in the secondary hue). */
  tune?: (pal: ArtPalette) => Partial<Record<string, RGB | null>>;
  /** Outline off for glows and effects. */
  noOutline?: boolean;
}

export function legendFor(pal: ArtPalette, tune?: Partial<Record<string, RGB | null>>): Legend {
  const secondary = ramp(mix(pal.danger[2], pal.accent[2], 0.45));
  const base: Record<string, RGB | null> = {
    k: pal.ink,
    w: pal.white,
    '1': pal.hero[0],
    '2': pal.hero[1],
    '3': pal.hero[2],
    '4': pal.hero[3],
    '5': pal.hero[4],
    a: pal.accent[1],
    A: pal.accent[2],
    b: pal.accent[3],
    B: pal.accent[4],
    x: pal.danger[0],
    d: pal.danger[1],
    D: pal.danger[2],
    e: pal.danger[3],
    E: pal.danger[4],
    t: pal.terrain[1],
    T: pal.terrain[2],
    u: pal.terrain[3],
    U: pal.terrain[4],
    p: pal.wood[0],
    q: pal.wood[1],
    Q: pal.wood[2],
    r: pal.wood[3],
    R: pal.wood[4],
    i: pal.ui[2],
    I: pal.ui[4],
    m: secondary[1],
    M: secondary[2],
    n: secondary[3],
    N: secondary[4],
    g: pal.garment[1],
    G: pal.garment[2],
    h: pal.garment[3],
    H: pal.garment[4],
  };
  for (const [k, v] of Object.entries(tune ?? {})) if (v !== undefined) base[k] = v;
  return base;
}

// ---------------------------------------------------------------- helpers

const W8 = '........';
/** Shift a template down by `by` rows (the top rows go empty, the bottom rows drop off). */
const down = (t: Template, by = 1): Template => [...Array.from({ length: by }, () => '.'.repeat(t[0]!.length)), ...t.slice(0, t.length - by)];
const withRows = (t: Template, rows: Record<number, string>): Template => t.map((r, i) => rows[i] ?? r);
const join = (...parts: Template[]): Template => parts.flat();

// ---------------------------------------------------------------- side-view hero (8 x 11, facing right)

/** Hair (accent) over the back of the head, a wide face looking right, tunic in the secondary hue. */
const HERO_HEAD: Template = ['...aAAb.', '..aAAAAb', '.aAA5555', '.aA55k5k', '.aA55555', '..a5555.'];
const HERO_TUNIC: Template = ['..GGGGG.', '.5GGGhh5', '..gGGGg.'];
const HERO_LEGS = {
  stand: ['..2...2.', '..1...1.'],
  contactA: ['1.....2.'],
  contactB: ['2.....1.'],
  pass: ['...12...', '...12...'],
  tuck: ['..2112..', W8],
  dangle: ['.2....1.', '.2....1.'],
  dash: ['21......', W8],
} as const;
const heroFrame = (head: Template, legs: readonly string[], drop = 0): Template => {
  const body = join(head, HERO_TUNIC);
  return drop ? join(down([...body, ...legs.map(() => W8)].slice(0, 11), drop).slice(0, 11 - legs.length), legs) : join(body, legs);
};
const HAIR_FLYING = withRows(HERO_HEAD, { 0: '..aAAb..', 1: '.aAAAAb.' });
const HAIR_STREAM = withRows(HERO_HEAD, { 2: 'aAAA5555', 3: 'aaA55k5k', 4: '.aA55555' });
const HURT_HEAD = withRows(HERO_HEAD, { 3: '.aA5kk5k', 4: '.aA5k5k5' });

const SIDE_HERO: Recipe = {
  anchor: 'feet',
  anims: {
    idle: [heroFrame(HERO_HEAD, HERO_LEGS.stand), heroFrame(HERO_HEAD, HERO_LEGS.contactA.map(() => '..2...2.'), 1)],
    run: [heroFrame(HERO_HEAD, HERO_LEGS.contactA, 1), heroFrame(HERO_HEAD, HERO_LEGS.pass), heroFrame(HERO_HEAD, HERO_LEGS.contactB, 1), heroFrame(HERO_HEAD, HERO_LEGS.pass)],
    jump: [heroFrame(HAIR_STREAM, HERO_LEGS.tuck)],
    fall: [heroFrame(HAIR_FLYING, HERO_LEGS.dangle)],
    dash: [heroFrame(HAIR_STREAM, HERO_LEGS.dash)],
    hurt: [heroFrame(HURT_HEAD, HERO_LEGS.dangle)],
  },
};

// ---------------------------------------------------------------- top-down hero (8 x 10): front, back, side

const TD_FRONT_HEAD: Template = ['..aAAb..', '.aAAAAb.', '.A5555A.', '.5k55k5.', '.555555.'];
const TD_BACK_HEAD: Template = ['..aAAb..', '.aAAAAb.', '.AAAAAA.', '.aAAAAa.', '..aAAa..'];
const TD_SIDE_HEAD: Template = ['..aAAb..', '.aAAAAb.', '.aA5555.', '.aA5k5k.', '..a5555.'];
const TD_BODY: Template = ['.GGGGGG.', '5GGhhGG5', '.gGGGGg.'];
const TD_LEGS = { stand: ['.2....2.', '.1....1.'], stepA: ['.2....1.', '......1.'], stepB: ['.1....2.', '.1......'], drop: ['.2....2.'] } as const;
const tdFrame = (head: Template, legs: readonly string[], drop = false): Template => (drop ? join([W8], head, TD_BODY, ['.2....2.']) : join(head, TD_BODY, legs));
const tdView = (head: Template): Record<string, Template[]> => ({
  idle: [tdFrame(head, TD_LEGS.stand), tdFrame(head, TD_LEGS.stand, true)],
  run: [tdFrame(head, TD_LEGS.stepA), tdFrame(head, TD_LEGS.stand, true), tdFrame(head, TD_LEGS.stepB), tdFrame(head, TD_LEGS.stand, true)],
  attack: [tdFrame(head, TD_LEGS.stepA)],
  hurt: [tdFrame(withRows(head, { 3: head[3]!.replace(/k/g, '4') }), TD_LEGS.stand)],
});
const prefixed = (prefix: string, anims: Record<string, Template[]>): Record<string, Template[]> => Object.fromEntries(Object.entries(anims).map(([k, v]) => [`${prefix}-${k}`, v]));

const TOPDOWN_HERO: Recipe = {
  anchor: 'feet',
  anims: { ...prefixed('down', tdView(TD_FRONT_HEAD)), ...prefixed('up', tdView(TD_BACK_HEAD)), ...prefixed('side', tdView(TD_SIDE_HEAD)) },
};

/** The puzzle keeper (12 x 12), the same hero drawn bigger: front, back and side views. */
const KEEPER_FRONT: Template = ['............', '....aAAb....', '...aAAAAb...', '...A5555A...', '...5k55k5...', '...455554...', '..GGGGGGGG..', '.5GGGhhGGG5.', '.5gGGGGGGg5.', '..gGGGGGGg..', '...2....2...', '...1....1...'];
const KEEPER_BACK: Template = withRows(KEEPER_FRONT, { 3: '...AAAAAA...', 4: '...aAAAAa...', 5: '....aAAa....' });
const KEEPER_SIDE: Template = withRows(KEEPER_FRONT, { 3: '...aA5555...', 4: '...aA5k5k...', 5: '....a5555...' });
const keeperView = (t: Template): Record<string, Template[]> => ({
  idle: [t, down(t)],
  run: [withRows(t, { 10: '...2....1...', 11: '........1...' }), down(t), withRows(t, { 10: '...1....2...', 11: '...1........' }), down(t)],
  hurt: [t],
});
const KEEPER: Recipe = { anchor: 'feet', anims: { ...prefixed('down', keeperView(KEEPER_FRONT)), ...prefixed('up', keeperView(KEEPER_BACK)), ...prefixed('side', keeperView(KEEPER_SIDE)) } };

// ---------------------------------------------------------------- shmup ship (8 x 8, pointing up)


/** The hull in the hero's garment colours (never the danger hue), a glinting cockpit, twin engines that flicker. */
const SHIP_BASE: Template = ['...ww...', '...hH...', '..hGGh..', '..GbBG..', '.hGBbGh.', 'hGGggGGh', 'Gg.gg.gG'];
const SHIP: Recipe = { anchor: 'center', anims: { idle: [join(SHIP_BASE, ['.a.Bb.a.']), join(SHIP_BASE, ['.A.bB.A.'])], hurt: [join(SHIP_BASE.map((r) => r.replace(/[GghH]/g, 'w')), ['.k.kk.k.'])] } };

// ---------------------------------------------------------------- side-view enemies

const WALKER: Recipe = {
  anchor: 'feet',
  anims: {
    run: [
      [W8, '...eeE..', '..eDDDe.', '.eDDDDw.', 'dDDDDDwk', 'dDDDDDDd', '.xdddddx', '.x.x.x..'],
      [W8, '...eeE..', '..eDDDe.', '.eDDDDw.', 'dDDDDDwk', 'dDDDDDDd', '.xdddddx', '..x.x.x.'],
    ],
    hurt: [[W8, '...EEE..', '..EEEEE.', '.EEEEEw.', 'eEEEEEwk', 'eEEEEEEe', '.deeeeed', '.k.k.k..']],
  },
};

const HOPPER: Recipe = {
  anchor: 'feet',
  anims: {
    idle: [
      [W8, W8, '...NN...', '..NMMMN.', '.NMMMMMn', '.MwkMwkM', 'mMMMMMMm', '.mmmmmm.'],
      [W8, W8, W8, '..NNNN..', '.NMMMMN.', 'NMwkMwkM', 'mMMMMMMm', 'mmmmmmmm'],
    ],
    jump: [['...NN...', '..NMMN..', '.NMMMMN.', '.MwkwkM.', '.MMMMMM.', '.mMMMMm.', '..mmmm..', W8]],
    hurt: [[W8, W8, '...EE...', '..EEEEE.', '.EEEEEEE', '.EwkEwkE', 'eEEEEEEe', '.eeeeee.']],
  },
};

const TURRET: Recipe = {
  anchor: 'feet',
  anims: {
    idle: [[W8, '...uu...', '..uUUu..', '.tuDEuTT', '.tTDDTTT', '.tTTTTt.', 'tTTTTTTt', 'tttttttt']],
    aim: [
      [W8, '...uu...', '..uUUu..', '.tuEwuEE', '.tTEETTE', '.tTTTTt.', 'tTTTTTTt', 'tttttttt'],
      [W8, '...uu...', '..uUUu..', '.tuDEuTT', '.tTDDTTT', '.tTTTTt.', 'tTTTTTTt', 'tttttttt'],
    ],
    hurt: [[W8, '...EE...', '..EEEE..', '.eEEEEEE', '.eEEEEEE', '.eEEEEe.', 'eEEEEEEe', 'eeeeeeee']],
  },
};

// ---------------------------------------------------------------- top-down and arena enemies

const BAT: Recipe = {
  anchor: 'center',
  anims: {
    run: [
      ['e......e', 'De.ee.eD', 'DDDEEDDD', '.dDwDwd.', '..DkDk..', '..dDDd..', '...dd...', W8],
      [W8, '...ee...', '..DEED..', '.dDwDwd.', 'dDDkDkDd', 'Dd.DD.dD', 'd..dd..d', W8],
    ],
    hurt: [['E......E', 'EE.EE.EE', 'EEEEEEEE', '.EEwEwE.', '..EkEk..', '..EEEE..', '...EE...', W8]],
  },
};

const BRUTE_BASE: Template = ['............', '...dDDDDd...', '..dDEEEEDd..', '.dDEEDDEEDd.', '.dDwkDDwkDd.', 'dDDDDDDDDDDd', 'dDwDwDDwDwDd', 'dDDDDDDDDDDd', '.dDDDDDDDDd.', '.ddDDDDDDdd.', '..xdd..ddx..', '..kkk..kkk..'];
const BRUTE: Recipe = {
  anchor: 'feet',
  anims: {
    run: [BRUTE_BASE, withRows(down(BRUTE_BASE), { 11: '.kkk....kkk.' })],
    windup: [withRows(BRUTE_BASE, { 4: '.dDEEDDEEDd.', 6: 'dDDDDDDDDDDd', 7: 'dDkkkkkkkkDd', 8: '.dDwDwwDwDd.' })],
    hurt: [BRUTE_BASE.map((r) => r.replace(/[dDx]/g, 'E'))],
  },
};

const GRUNT_BASE: Template = ['.n....n.', '.MnMMnM.', '..MMMM..', '.MwkMwk.', '.MMMMMM.', '..dDDd..', '.MdDDdM.', '..k..k..'];
const GRUNT: Recipe = {
  anchor: 'feet',
  anims: {
    run: [GRUNT_BASE, withRows(GRUNT_BASE, { 7: '.k....k.' })],
    windup: [withRows(GRUNT_BASE, { 3: '.MEkMEk.', 5: 'M.dDDd.M', 6: '..dDDd..' })],
    bite: [withRows(GRUNT_BASE, { 4: '.MkkkkM.', 3: '.MEkMEk.' })],
    hurt: [GRUNT_BASE.map((r) => r.replace(/[MmNn]/g, 'E'))],
  },
};

const ARCHER_BASE: Template = ['...tt...', '..tTTt..', '.tTkkTt.', '.tEkkEtq', '..tTTt.q', '.tTTTTtq', '.tTTTTtq', '..k..k..'];
const ARCHER: Recipe = {
  anchor: 'feet',
  anims: {
    run: [ARCHER_BASE, withRows(ARCHER_BASE, { 7: '.k....k.' })],
    aim: [withRows(ARCHER_BASE, { 3: '.tEkkEtR', 4: '..tTTtwq', 5: '.tTTTTwq' })],
    hurt: [ARCHER_BASE.map((r) => r.replace(/[tT]/g, 'E'))],
  },
};

const DRONE: Recipe = {
  anchor: 'center',
  anims: {
    run: [
      [W8, '...ee...', '..eEEe..', '.dDwkDd.', 'dDDDDDDd', '.dddddd.', '..x..x..', W8],
      [W8, '...ee...', '..eEEe..', '.dDkwDd.', 'dDDDDDDd', '.dddddd.', '..E..E..', W8],
    ],
    hurt: [[W8, '...EE...', '..EEEE..', '.EEwkEE.', 'EEEEEEEE', '.eeeeee.', '..e..e..', W8]],
  },
};

const GUNSHIP_BASE: Template = ['..tt....tt..', '.tTTt..tTTt.', '.tTDDDDDDTt.', 'tTDDEEEEDDTt', 'tTDEwkkwEDTt', 'tTDDEEEEDDTt', '.tTDDDDDDTt.', '..tTTDDTTt..', '...tTDDTt...', '....tDDt....', '.....dd.....', '.....kk.....'];
const GUNSHIP: Recipe = { anchor: 'center', anims: { run: [GUNSHIP_BASE, withRows(GUNSHIP_BASE, { 11: '.....EE.....' })], hurt: [GUNSHIP_BASE.map((r) => r.replace(/[tTdD]/g, 'E'))] } };

// ---------------------------------------------------------------- bosses

/** The warden (16 x 16): a horned, armoured hulk with an ember core that flares when it winds up a slam. */
const WARDEN_BASE: Template = [
  '..u..........u..',
  '.uUt........tUu.',
  '.tUTt.tttt.tTUt.',
  '..tTTtTTTTtTTt..',
  '...tTTTTTTTTt...',
  '..dtTkbTTbkTtd..',
  '.dDtTTTTTTTTtDd.',
  'dDDdtTTkkTTtdDDd',
  'dDDDdtTTTTtdDDDd',
  'dDEDDdBbbBdDDEDd',
  '.dDDDDbAAbDDDDd.',
  '.dDDDDDbbDDDDDd.',
  '..dDDDDDDDDDDd..',
  '..xdDDd..dDDdx..',
  '..kxxd....dxxk..',
  '.kkk........kkk.',
];
const WARDEN: Recipe = {
  anchor: 'feet',
  anims: {
    idle: [WARDEN_BASE, withRows(WARDEN_BASE, { 9: 'dDEDDdBBbBdDDEDd', 10: '.dDDDDbAAbDDDDd.' })],
    run: [WARDEN_BASE, withRows(WARDEN_BASE, { 13: '...xdDDd.dDDdx..', 14: '...kxxd...dxxk..', 15: '..kkk......kkk..' })],
    // The slam: crouched a pixel lower, fists on the floor either side.
    slam: [withRows(down(WARDEN_BASE, 1), { 12: 'dD.dDDDDDDDDd.Dd', 13: 'dDxdDDd..dDDdxDd', 14: 'kkkxxd....dxxkkk', 15: 'kkk..........kkk' })],
    // Fists raised over the head, the core white-hot: the slam is coming.
    windup: [withRows(WARDEN_BASE, { 0: 'dDu..........uDd', 1: 'DDUt........tUDD', 6: '..dtTTTTTTTTtd..', 7: '..dDtTTkkTTtDd..', 9: 'dDEDDdBwwBdDDEDd', 10: '.dDDDDwBBwDDDDd.' })],
    aim: [withRows(WARDEN_BASE, { 5: '..dtTkBTTBkTtd..', 9: 'dDEDDdBBBBdDDEDd' })],
    hurt: [WARDEN_BASE.map((r) => r.replace(/[dDxtTuU]/g, 'E'))],
  },
};

// ---------------------------------------------------------------- projectiles

const ORB: Recipe = { anchor: 'center', anims: { run: [['.EE.', 'EwwE', 'EwwE', '.EE.'], ['.ee.', 'eEEe', 'eEEe', '.ee.']] } };
const ARROW: Recipe = { anchor: 'center', anims: { run: [['q...', 'qqqw', 'q...', '....']] } };
/** A boss's ember: a hot core that flickers between white and gold inside a red shell. */
const EMBER: Recipe = { anchor: 'center', anims: { run: [['.eE.', 'eBwE', 'EwBe', '.Ee.'], ['.Ee.', 'EwBe', 'eBwE', '.eE.']] } };
const LASER: Recipe = { anchor: 'center', anims: { run: [['.w.', 'bwb', 'bwb', '.b.', '.a.', '.a.'], ['.w.', 'BwB', 'bwb', '.b.', '.b.', '.a.']] } };

// ---------------------------------------------------------------- pickups and relics

const COIN: Recipe = {
  anchor: 'center',
  anims: {
    idle: [
      ['.bbAa.', 'bBAAAa', 'bAbAAa', 'bAbAAa', 'bAAAAa', '.aAAa.'],
      ['..bA..', '.bBAa.', '.bbAa.', '.bbAa.', '.bAAa.', '..Aa..'],
      ['..ba..', '..bA..', '..bA..', '..bA..', '..bA..', '..aa..'],
      ['..Ab..', '.aABb.', '.aAbb.', '.aAbb.', '.aAAb.', '..aA..'],
    ],
  },
};
const GEM: Recipe = { anchor: 'center', anims: { idle: [['..b..', '.bBA.', 'bBAAa', '.AAa.', '..a..'], ['..B..', '.bwA.', 'bBAAa', '.AAa.', '..a..']] } };
const CRYSTAL: Recipe = { anchor: 'center', anims: { idle: [['.nN.', 'nNMm', '.Mm.', '.m..'], ['.NN.', 'nwMm', '.Mm.', '.m..']] } };
const CAPSULE: Recipe = { anchor: 'center', anims: { idle: [['.nnnn.', 'nNwwNn', 'nNwNwn', 'nNwwNn', 'nNwNNn', '.nnnn.'], ['.NNNN.', 'NnwwnN', 'NnwnwN', 'NnwwnN', 'NnwnnN', '.NNNN.']] } };
const WINGS: Recipe = { anchor: 'center', anims: { idle: [['.....bB.', '....bBw.', '...bBww.', '..bBww4.', '.bBww44.', 'bBww44..', 'Bww44...', '.w44....']] } };
const BOOTS: Recipe = { anchor: 'center', anims: { idle: [[W8, '..qQQ...', '..qRQ...', '..qQQ...', '..qQQ...', '.qQQQQq.', '.qQQQQQb', '.pppppbB']] } };
const KEY: Recipe = { anchor: 'center', anims: { idle: [['.bA...', 'b.aA..', '.aA...', '..A...', '..AA..', '..Aa..']] } };
/** A locked door three tiles tall (8 x 24): planks in an iron frame, iron bands, a keyhole that glints. */
const DOOR_PLANKS = 'tTQrQrTt';
const DOOR_BAND = 'tuUuuUut';
const DOOR_BASE: Template = ['tUUUUUUt', 'tTuuuuTt', DOOR_PLANKS, DOOR_PLANKS, DOOR_BAND, DOOR_PLANKS, DOOR_PLANKS, DOOR_PLANKS, DOOR_PLANKS, DOOR_PLANKS, DOOR_BAND, 'tTQkkrTt', 'tTQkkrTt', 'tTQrkrTt', DOOR_PLANKS, DOOR_PLANKS, DOOR_BAND, DOOR_PLANKS, DOOR_PLANKS, DOOR_PLANKS, DOOR_PLANKS, DOOR_BAND, DOOR_PLANKS, 'tttttttt'];
const DOOR: Recipe = { anchor: 'center', anims: { idle: [DOOR_BASE, withRows(DOOR_BASE, { 11: 'tTQbkrTt' })] } };

// ---------------------------------------------------------------- puzzle props

const CRATE_BASE: Template = ['pqqqqqqqqqqqqp', 'qRRRRRRRRRRRrq', 'qRrQQQQQQQQrrq', 'qRQrQQQQQQrQrq', 'qRQQrQQQQrQQrq', 'qRQQQrQQrQQQrq', 'qRQQQQrrQQQQrq', 'qRQQQQrrQQQQrq', 'qRQQQrQQrQQQrq', 'qRQQrQQQQrQQrq', 'qRQrQQQQQQrQrq', 'qRrQQQQQQQQrrq', 'qrrrrrrrrrrrrq', 'pqqqqqqqqqqqqp'];
const CRATE: Recipe = { anchor: 'center', anims: { idle: [CRATE_BASE], lit: [CRATE_BASE.map((r, i) => (i === 0 || i === 13 ? r.replace(/q/g, 'A') : r.replace(/^q/, 'A').replace(/q$/, 'A')))] } };
const TARGET: Recipe = {
  anchor: 'center',
  noOutline: true,
  anims: {
    idle: [['...bbbb...', '..b....b..', '.b......b.', 'b...aa...b', 'b..a..a..b', 'b..a..a..b', 'b...aa...b', '.b......b.', '..b....b..', '...bbbb...']],
    lit: [['...BBBB...', '..BbbbbB..', '.Bb....bB.', 'Bb..AA..bB', 'Bb.A..A.bB', 'Bb.A..A.bB', 'Bb..AA..bB', '.Bb....bB.', '..BbbbbB..', '...BBBB...']],
  },
};

export const RECIPES: Record<string, Recipe> = {
  'hero-side': SIDE_HERO,
  'hero-topdown': TOPDOWN_HERO,
  keeper: KEEPER,
  ship: SHIP,
  walker: WALKER,
  hopper: HOPPER,
  turret: TURRET,
  bat: BAT,
  brute: BRUTE,
  grunt: GRUNT,
  archer: ARCHER,
  warden: WARDEN,
  drone: DRONE,
  gunship: GUNSHIP,
  orb: ORB,
  arrow: ARROW,
  ember: EMBER,
  laser: LASER,
  coin: COIN,
  gem: GEM,
  crystal: CRYSTAL,
  capsule: CAPSULE,
  wings: WINGS,
  boots: BOOTS,
  key: KEY,
  door: DOOR,
  crate: CRATE,
  target: TARGET,
};

/** Entity types of the shipped genres and the recipe each draws with; anything else falls back by role. */
export const TYPE_RECIPES: Readonly<Record<string, string>> = {
  walker: 'walker',
  hopper: 'hopper',
  turret: 'turret',
  bolt: 'orb',
  coin: 'coin',
  chaser: 'bat',
  brute: 'brute',
  xp: 'crystal',
  grunt: 'grunt',
  archer: 'archer',
  arrow: 'arrow',
  warden: 'warden',
  ember: 'ember',
  gem: 'gem',
  drone: 'drone',
  tank: 'gunship',
  bullet: 'orb',
  shot: 'laser',
  power: 'capsule',
  wings: 'wings',
  boots: 'boots',
  key: 'key',
  door: 'door',
  crate: 'crate',
  target: 'target',
};

/** Every frame of a recipe painted and outlined: one pixel of padding on each side for the outline. */
export function paintFrames(recipe: Recipe, pal: ArtPalette): Array<{ anim: string; frame: number; pc: PixelCanvas }> {
  const legend = legendFor(pal, recipe.tune?.(pal));
  const out: Array<{ anim: string; frame: number; pc: PixelCanvas }> = [];
  for (const [anim, frames] of Object.entries(recipe.anims)) {
    frames.forEach((t, frame) => {
      const w = Math.max(...t.map((r) => r.length));
      const pc = new PixelCanvas(w + 2, t.length + 2);
      pc.stamp(t, legend, 1, 1);
      if (!recipe.noOutline) pc.outline(pal.outline, pal.ink);
      out.push({ anim, frame, pc });
    });
  }
  return out;
}

/** Frame size of a recipe (template size plus the outline padding). */
export function frameSize(recipe: Recipe): { w: number; h: number } {
  const first = Object.values(recipe.anims)[0]![0]!;
  return { w: Math.max(...first.map((r) => r.length)) + 2, h: first.length + 2 };
}

