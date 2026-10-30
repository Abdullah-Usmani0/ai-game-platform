import { mix, ramp, type RGB } from './color.js';
import type { ArtPalette } from './palette.js';
import { hash2, PixelCanvas, type Legend, type Template } from './pixels.js';

/**
 * Entity sprites: hand-made pixel templates per animation, recoloured from the game's palette and outlined in the
 * style card's mode. A template character names a palette slot; every sprite shares the same slot letters:
 *
 *   k ink        w white      1-5 hero ramp (dark to light)      a A b B accent (shadow, base, light, glint)
 *   x d D e E danger (darkest to light)   t T u U terrain/metal   p q Q r R wood   i I ui
 *   m M n N secondary hue (between danger and accent)   g G h H the hero's garment (opposite the danger hue)
 *   o v V y Y foliage (darkest to light)   O s wet earth (darkest, dark)   c C z Z produce (a crop's own colour; the accent by default)
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
  /** Lies on the ground (a soil plot): drawn under everything that stands, whatever its row. */
  floor?: boolean;
  /** Casts no shadow (a door in a wall, a house front). */
  noShadow?: boolean;
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
    o: pal.rim[0],
    v: pal.rim[1],
    V: pal.rim[2],
    y: pal.rim[3],
    Y: pal.rim[4],
    O: mix(pal.wood[0], pal.ink, 0.45),
    s: mix(pal.wood[1], pal.ink, 0.35),
    c: pal.accent[1],
    C: pal.accent[2],
    z: pal.accent[3],
    Z: pal.accent[4],
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

// ---------------------------------------------------------------- the farm

/** The farmer: the top-down hero under a straw hat. */
const FARMER_FRONT: Template = ['..rRRr..', 'rRRRRRRr', '.A5555A.', '.5k55k5.', '.555555.'];
const FARMER_BACK: Template = ['..rRRr..', 'rRRRRRRr', '.AAAAAA.', '.aAAAAa.', '..aAAa..'];
const FARMER_SIDE: Template = ['..rRRr..', '.rRRRRRr', '.aA5555.', '.aA5k5k.', '..a5555.'];
const FARMER: Recipe = { anchor: 'feet', anims: { ...prefixed('down', tdView(FARMER_FRONT)), ...prefixed('up', tdView(FARMER_BACK)), ...prefixed('side', tdView(FARMER_SIDE)) } };

/** A soil plot (8 x 8): rough untilled ground, furrowed tilled soil, or soil dark and glinting from the watering can. */
const SOIL: Template = ['.qQQqQq.', 'qQrQQQrq', 'QQQqQQQQ', 'QrQQQqQQ', 'QQQQrQQq', 'qQqQQQQQ', 'QQQQQqrQ', '.qQQQQq.'];
const TILLED: Template = ['.pqqqqp.', 'pqrrrrqp', 'pppppppp', 'pqrrrrqp', 'pppppppp', 'pqrrrrqp', 'pppppppp', '.pqqqqp.'];
const WATERED: Template = TILLED.map((r) => r.replace(/p/g, 'O').replace(/q/g, 's').replace(/r/g, 'q'));
const PLOT: Recipe = { anchor: 'center', noOutline: true, floor: true, noShadow: true, anims: { soil: [SOIL], tilled: [TILLED], watered: [withRows(WATERED, { 1: 'Osqwqqso', 5: 'Osqqqwso' }), WATERED] } };

/** A planting's first two stages, the same for every crop: a seed in its mound, then a sprout. */
const SEEDLING: Template = [W8, W8, W8, W8, W8, '...Rr...', '..qrrq..', W8];
const SPROUT: Template = [W8, W8, W8, '..Y..Y..', '..yVVy..', '...vv...', '...vv...', W8];
const tall = (t: Template): Template => [W8, W8, W8, W8, ...t];
/**
 * Crops by shape, in their four stages (seed, sprout, grown, ripe); the produce is drawn in the crop's own colour
 * (cropRecipe, cropTune). Tall crops stand twelve pixels high.
 */
const CROP_SHAPES: Readonly<Record<string, Readonly<Record<string, Template>>>> = {
  root: {
    seed: SEEDLING,
    sprout: SPROUT,
    grown: [W8, '.Y....Y.', '.yV..Vy.', '..yVVy..', '...VV...', '..vVVv..', '...vv...', W8],
    ripe: ['.Y....Y.', '.yV..Vy.', '..yVVy..', '...VV...', '..zZZz..', '.zCCCCc.', '.cCCCCc.', '..cCCc..'],
  },
  leafy: {
    seed: SEEDLING,
    sprout: SPROUT,
    grown: [W8, W8, '...yY...', '..yVVy..', '.yVvVVy.', '.vVVvVv.', '..vvvv..', W8],
    ripe: [W8, '..zZZz..', '.zCZCCz.', 'zCCzCCCz', 'cCzCCzCc', 'cCCCCCCc', '.cCCCCc.', '..cccc..'],
  },
  tall: {
    seed: tall(SEEDLING),
    sprout: tall(SPROUT),
    grown: [W8, '...Y....', '...yV...', '..yVv...', '.y.Vv.Y.', '...Vvy..', '..yVv...', '...Vv...', '.yVVv...', '...Vv.y.', '...Vvy..', '...vv...'],
    ripe: ['...Z....', '..zZz...', '...yV...', '..yVv...', '.y.VvzZ.', '...VczC.', '..yVcCv.', '...Vvc..', '.yVVv...', 'zZ.Vv.y.', 'cC.Vvy..', '...vv...'],
  },
  bush: {
    seed: SEEDLING,
    sprout: SPROUT,
    grown: [W8, '..yYYy..', '.yVVVVy.', 'yVVvVVVy', 'vVVVvVVv', '.vVVVVv.', '..vqqv..', '...qq...'],
    ripe: [W8, '..yYYy..', '.yVZzVy.', 'yVzCcVVy', 'vVVcVZzv', '.vZzVCcv', '..cCqv..', '...qq...'],
  },
};
export const CROP_SHAPE_NAMES: readonly string[] = Object.keys(CROP_SHAPES);
/** The recipe of a crop of a shape (root, leafy, tall, bush; another shape draws as a root). */
export function cropRecipe(shape: string): Recipe {
  const stages = CROP_SHAPES[shape] ?? CROP_SHAPES['root']!;
  return { anchor: 'feet', anims: Object.fromEntries(Object.entries(stages).map(([stage, t]) => [stage, [t]])) };
}
/** A crop's produce colours from its own colour: shadow, base, light and glint. */
export function cropTune(color: RGB): Partial<Record<string, RGB>> {
  const r = ramp(color);
  return { c: r[1], C: r[2], z: r[3], Z: r[4] };
}

/** The shipping bin (8 x 8): a lidded wooden box with a brass badge. */
const BIN: Recipe = { anchor: 'feet', anims: { idle: [['.rRRRRr.', 'rQQQQQQr', 'qppppppq', 'qQrQQrQq', 'qQrbBrQq', 'qQrQQrQq', 'qqqqqqqq', '.p....p.']] } };

/** The seed stall (16 x 16): a striped awning over a counter of produce, a coin on its sign. */
const STALL_BASE: Template = [
  '..wAAwwAAwwAAw..',
  '.wAAwwAAwwAAwwA.',
  'wAAwwAAwwAAwwAAw',
  'aAAaaAAaaAAaaAAa',
  '.a.a.a.a.a.a.a.a',
  '.q............q.',
  '.q..zZ..nN.yY.q.',
  '.q.zCCz.nM.Vyyq.',
  '.qrRRRRRRRRRRRq.',
  '.qQQQQQQQQQQQQq.',
  '.qQpQQQQQQQQpQq.',
  '.qQQQrrrrrrQQQq.',
  '.qQQQrrbBrrQQQq.',
  '.qQQQrrrrrrQQQq.',
  '.qqqqqqqqqqqqqq.',
  '.pp..........pp.',
];
const STALL: Recipe = { anchor: 'feet', anims: { idle: [STALL_BASE, withRows(STALL_BASE, { 4: 'a.a.a.a.a.a.a.a.' })] } };

/** The farmhouse door (8 x 8), where the farmer goes to bed: planks, iron bands, a brass knob. */
const DOOR_FRONT: Recipe = { anchor: 'feet', noShadow: true, anims: { idle: [['.pqqqqp.', 'pqQQQQqp', 'pQrQQrQp', 'ptttttup', 'pQrQQbQp', 'pQrQQrQp', 'ptttttup', 'pppppppp']] } };

/** The farmhouse front (48 x 24): a tiled roof with a chimney, plank walls, two lit windows with flower boxes. */
function houseFront(): Template {
  const W = 48;
  const rows = Array.from({ length: 24 }, () => Array<string>(W).fill('.'));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < 24) rows[y]![x] = c;
  };
  // The roof: a ridge thirty-two pixels wide that widens a pixel each side a row, in courses of tiles.
  for (let y = 0; y < 12; y++) {
    const from = Math.max(0, 8 - y);
    const to = Math.min(W - 1, 39 + y);
    for (let x = from; x <= to; x++) {
      const course = Math.floor(y / 3);
      const tile = (x + course * 2) % 4 === 0;
      put(x, y, y === 0 ? 'N' : x === from || x === to || y % 3 === 2 ? 'm' : tile ? 'M' : y % 3 === 0 ? 'n' : 'M');
    }
  }
  // A stone chimney on the right of the roof.
  for (let y = 0; y < 6; y++) for (let x = 34; x < 38; x++) put(x, y, y === 0 ? 'u' : x === 34 || x === 37 ? 't' : 'T');
  // Walls of vertical planks under the eaves' shadow, on a stone footing.
  for (let y = 12; y < 24; y++) for (let x = 0; x < W; x++) put(x, y, y === 12 ? 'p' : y === 13 ? 'q' : y === 23 ? (x % 3 === 0 ? 't' : 'T') : x % 4 === 0 ? 'q' : x % 4 === 1 ? 'r' : 'Q');
  // Two warm windows with a cross bar, a flower box under each.
  for (const wx of [4, 37]) {
    for (let y = 14; y < 20; y++) {
      for (let x = wx; x < wx + 7; x++) put(x, y, y === 14 || y === 19 || x === wx || x === wx + 6 ? 'p' : x === wx + 3 || y === 16 ? 'q' : y === 15 && x < wx + 3 ? 'B' : 'b');
    }
    for (let x = wx - 1; x < wx + 8; x++) put(x, 20, 'q');
    for (let x = wx; x < wx + 7; x++) put(x, 21, x % 2 === 0 ? 'y' : 'n');
  }
  return rows.map((r) => r.join(''));
}
const HOUSE: Recipe = { anchor: 'feet', noShadow: true, anims: { idle: [houseFront()] } };

/** A round tree (16 x 16): a lumpy canopy lit from the top left over a short trunk; it sways a little. */
function treeFrame(sway: number): Template {
  const rows = Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
  for (let y = 10; y < 16; y++) {
    rows[y]![7] = y === 15 ? 'p' : 'q';
    rows[y]![8] = y === 15 ? 'p' : 'Q';
  }
  rows[15]![6] = 'p';
  rows[15]![9] = 'p';
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8 - (y < 6 ? sway : 0);
      const dy = (y + 0.5 - 6.5) * 1.12;
      const lump = hash2(Math.floor(x / 2), Math.floor(y / 2), 211) * 7;
      const r2 = dx * dx + dy * dy;
      if (r2 > 40 + lump) continue;
      const light = -dx - dy + hash2(x, y, 223) * 2.2;
      rows[y]![x] = r2 > 30 + lump ? 'o' : light > 5 ? 'Y' : light > 1.5 ? 'y' : light > -2.5 ? 'V' : 'v';
    }
  }
  return rows.map((r) => r.join(''));
}
const TREE: Recipe = { anchor: 'feet', anims: { idle: [treeFrame(0), treeFrame(0), treeFrame(1), treeFrame(0)] } };

/** A bush (8 x 8) with a few berries. */
const BUSH: Recipe = { anchor: 'feet', anims: { idle: [['..yYYy..', '.yVVYVy.', 'yVVVVVVy', 'VVnVVVnV', 'vVVVVNVv', '.vVVVVv.', '..oooo..', W8]] } };

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
  farmer: FARMER,
  plot: PLOT,
  bin: BIN,
  stall: STALL,
  'door-front': DOOR_FRONT,
  house: HOUSE,
  tree: TREE,
  bush: BUSH,
  ...Object.fromEntries(CROP_SHAPE_NAMES.map((shape) => [`crop-${shape}`, cropRecipe(shape)])),
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
  plot: 'plot',
  bin: 'bin',
  shop: 'stall',
  bed: 'door-front',
  house: 'house',
  tree: 'tree',
  bush: 'bush',
  // A crop draws by its shape and colour (cropRecipe); this is its look before it knows them.
  crop: 'crop-root',
};

/** The recipe an entity type draws with: its own, or that of the shipped type it is drawn as (a renamed type). */
export function recipeForType(type: string, drawAs?: string): string | undefined {
  return TYPE_RECIPES[drawAs ?? type];
}

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

