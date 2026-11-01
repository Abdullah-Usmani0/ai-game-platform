import type { RGB, Ramp } from '../color.js';
import type { Recipe } from '../sprites.js';
import { sinCosDeg } from '../../../sim/trig.js';
import { plus, polar, v, type Vec } from './geometry.js';
import { rasterize, type Part } from './raster.js';

/**
 * The castle tier's cast, built from capsules and polygons like the knight and lit the same way, then baked into
 * palette-free recipe templates: every material is a ramp of recipe slot letters (the danger ramp, the stone, the
 * accent...), so the frames recolour with the game's palette, take its outline, and go through the same art QA,
 * designs and golden lock as every hand-made sprite.
 */

/** A shade of a material as the slot letter a template uses for it; the rasterizer's ink is the outline's 'k'. */
const code = (ch: string): RGB => [ch.charCodeAt(0), 1, 2];
/** A material ramp, dark to light, as five slot letters. */
const R = (slots: string): Ramp => [...slots].map(code) as unknown as Ramp;
const LIGHT: readonly [number, number, number] = (() => {
  const l = Math.sqrt(0.35 * 0.35 + 0.8 * 0.8 + 0.55 * 0.55);
  return [0.35 / l, -0.8 / l, 0.55 / l] as const;
})();

/** One frame's parts as a template: shaded as the knight is (key light, bands, dither, contour, back light), no outline. */
function bake(parts: readonly Part[], w: number, h: number): string[] {
  const r = rasterize(parts, w, h, { light: LIGHT, bands: [-0.35, 0.05, 0.5, 0.84], dither: 0.16, outline: 'none', ink: code('k'), contour: true, rim: { side: -1, above: h }, floor: h });
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += r.color.alpha(x, y) ? String.fromCharCode(r.color.get(x, y)[0]) : '.';
    rows.push(row);
  }
  return rows;
}

const cap = (id: string, a: Vec, b: Vec, ra: number, rb: number, mat: Ramp, depth: number, bias = 0, mark?: Part['mark']): Part => ({ id, shape: { kind: 'capsule', a, b, ra, rb }, mat, depth, bias, ...(mark ? { mark } : {}) });
const poly = (id: string, pts: Vec[], round: number, mat: Ramp, depth: number, bias = 0): Part => ({ id, shape: { kind: 'poly', pts, round }, mat, depth, bias });

/** Shifts parts so the lowest point of `feet` stands on row `floor`. */
function stand(parts: Part[], feet: Vec[], floor: number): Part[] {
  const low = Math.max(...feet.map((f) => f.y));
  const dy = floor - low;
  const mv = (p: Vec) => v(p.x, p.y + dy);
  return parts.map((p) => ({ ...p, shape: p.shape.kind === 'capsule' ? { ...p.shape, a: mv(p.shape.a), b: mv(p.shape.b) } : { ...p.shape, pts: p.shape.pts.map(mv) }, ...(p.mark ? { mark: (x: number, y: number) => p.mark!(x, y - Math.round(dy)) } : {}) }));
}

// ---------------------------------------------------------------- ghoul: a gaunt, hunched shambler (38 x 36)

// Room round the body for the arms: raised over the skull to claw, raked or reached out ahead.
export const GHOUL_W = 38, GHOUL_H = 36;
/**
 * The claw by frame: the arms swing up and back over the skull (the wind-up a player reads), rake forward and down as
 * the body lunges (the blow), then drop and settle. Lean, arm angle (-90 up, 0 ahead, 90 down) and the pelvis's step.
 */
const CLAW = [
  { lean: 2, a: 20, dx: 0 },
  { lean: -10, a: -125, dx: -1 },
  { lean: 26, a: 25, dx: 3 },
  { lean: 22, a: 75, dx: 3 },
  { lean: 10, a: 70, dx: 1 },
] as const;
export function ghoul(t: number, mode: 'walk' | 'lurch' | 'hurt' | 'claw'): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  // Dried-blood flesh, dark-weighted; a pale skull face; rags; bone claws; one ember eye.
  const flesh = R('xxdDe'), skull = R('33445'), rags = R('ppqQQ'), claw = R('33445'), eyeR = R('EEEEE');
  const lurch = mode === 'lurch';
  const hurt = mode === 'hurt';
  const k = mode === 'claw' ? CLAW[Math.min(CLAW.length - 1, Math.round(t * CLAW.length))]! : null;
  const lean = k ? k.lean : hurt ? -20 : lurch ? 14 : 4;
  const swing = lurch ? 28 : k ? 8 : 16;
  const pelvis = v(16 + (k ? k.dx : 0), 22 - (k ? 0 : Math.abs(c) * (lurch ? 1 : 0.6)));
  const chest = plus(pelvis, polar(-58 + lean, 7.5));
  const hump = plus(chest, polar(-150 + lean, 2.2));
  const neck = plus(chest, polar(-15 + lean, 2.6));
  const head = plus(neck, polar(15 + lean * 0.4, 2.4));
  const leg = (phase: number, dx: number) => {
    const hip = plus(pelvis, v(dx, 0.5));
    const a = 94 + swing * phase;
    const knee = plus(hip, polar(a - 16, 6));
    const ankle = plus(knee, polar(a + 22 + 18 * Math.max(0, -phase), 6.5));
    return { hip, knee, ankle, toe: plus(ankle, v(2.2, 0.4)) };
  };
  // Clawing, the feet are planted wide: the near one forward, the far one back.
  const nl = leg(k ? -0.9 : s, 1), fl = leg(k ? 0.9 : -s, -1);
  const arm = (phase: number, side: number) => {
    const sh = plus(chest, v(side * 0.8, 1.2));
    const a = k ? k.a + side * 10 : hurt ? 160 : lurch ? 12 + 12 * phase : 70 - 16 * phase;
    const el = plus(sh, polar(a, 6));
    // A claw's forearm hooks down from the elbow, the bone claws curling under it.
    const hand = plus(el, polar(a + (k ? 32 : lurch ? 6 : 16), 6));
    return { sh, el, hand, tip: plus(hand, polar(a + (k ? 64 : lurch ? 30 : 50), k ? 2.6 : 2.2)) };
  };
  const na = arm(-s, 1), fa = arm(s, -1);
  const eyeAt = plus(head, polar(-25 + lean * 0.4, 1.3));
  const parts = [
    cap('upperF', fa.sh, fa.el, 1.2, 1, flesh, 1, -1), cap('foreF', fa.el, fa.hand, 1, 0.8, flesh, 1.01, -1), cap('clawF', fa.hand, fa.tip, 0.7, 0.35, claw, 1.02, -1),
    cap('thighF', fl.hip, fl.knee, 1.4, 1.1, flesh, 1.5, -1), cap('shinF', fl.knee, fl.ankle, 1.1, 0.9, flesh, 1.51, -1), cap('footF', fl.ankle, fl.toe, 0.9, 0.7, flesh, 1.52, -1),
    cap('torso', pelvis, chest, 2.6, 3.4, flesh, 3), cap('hump', chest, hump, 2.6, 2, flesh, 3.05),
    poly('rags', [plus(pelvis, v(-3, -1.5)), plus(pelvis, v(3, -1)), plus(pelvis, v(3.5, 3.5)), plus(pelvis, v(1.5, 5.5)), plus(pelvis, v(-0.5, 4)), plus(pelvis, v(-2, 6)), plus(pelvis, v(-3.5, 3))], 0.6, rags, 3.2),
    // The wind-up throws the skull back, its maw agape.
    cap('neck', chest, neck, 1.6, 1.3, flesh, 3.5), cap('skull', neck, head, 1.7, 2.1, skull, 4), cap('maw', head, plus(head, polar(55 + lean * 0.4 + (k && k.a < 0 ? -25 : 0), k && k.a < 0 ? 2.2 : 1.6)), 1.1, 0.8, skull, 4.05, -2),
    cap('eye', eyeAt, eyeAt, 0.55, 0.55, eyeR, 4.2),
    cap('thighN', nl.hip, nl.knee, 1.5, 1.2, flesh, 5), cap('shinN', nl.knee, nl.ankle, 1.2, 0.95, flesh, 5.01), cap('footN', nl.ankle, nl.toe, 0.95, 0.7, flesh, 5.02),
    cap('upperN', na.sh, na.el, 1.3, 1.05, flesh, 6), cap('foreN', na.el, na.hand, 1.05, 0.85, flesh, 6.01), cap('clawN', na.hand, na.tip, 0.75, 0.35, claw, 6.02),
  ];
  return stand(parts, [nl.ankle, fl.ankle, nl.toe, fl.toe], GHOUL_H - 1);
}

// ---------------------------------------------------------------- hound: a lean crypt hound (30 x 20)

export const HOUND_W = 30, HOUND_H = 20;
/**
 * The pounce by frame: settled low, then coiled lower with its haunches up (the wind-up a player reads), then launched
 * jaws first, in flight, and down again.
 */
const POUNCE = ['crouch', 'coil', 'bite', 'leap', 'crouch'] as const;
export function hound(t: number, mode: 'crouch' | 'run' | 'leap' | 'hurt' | 'pounce'): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  const fur = R('kxxdD'), belly = R('kkxxd'), eyeR = R('EEEEE'), fang = R('33445');
  const step = mode === 'pounce' ? POUNCE[Math.min(POUNCE.length - 1, Math.round(t * POUNCE.length))]! : null;
  const coil = step === 'coil', bite = step === 'bite';
  const crouch = mode === 'crouch' || step === 'crouch' || coil, leap = mode === 'leap' || step === 'leap' || bite, hurt = mode === 'hurt';
  const low = coil ? 3.6 : crouch ? 2 + (step ? 0.4 : c * 0.4) : 0;
  const pitch = coil ? 7 : leap ? -10 : hurt ? 8 : mode === 'run' ? s * 4 : 0;
  const hip = v(9, 11 + low);
  const shoulder = plus(hip, polar(-4 + pitch, 10));
  const neck = plus(shoulder, polar(crouch ? -10 : -38, 4));
  const head = plus(neck, polar(crouch ? 10 : 0, 2.2));
  const snout = plus(head, polar(crouch ? 22 : bite ? 2 : 14, 3.6));
  // Launched to bite, the jaw drops open under the snout.
  const jaw = plus(head, polar(48, 3));
  const ear = plus(head, polar(-140, 2.6));
  const tailA = plus(hip, polar(-160 + (mode === 'run' ? c * 12 : 0), 4));
  const tailB = plus(tailA, polar(-200 + (mode === 'run' ? c * 20 : 10), 3.5));
  // A leg: from its root, a thigh and a lower leg at the given angles; dog hind legs bend back at the hock.
  const leg = (root: Vec, a1: number, a2: number, l1: number, l2: number) => {
    const mid = plus(root, polar(a1, l1));
    const foot = plus(mid, polar(a2, l2));
    return { root, mid, foot, toe: plus(foot, v(1.6, 0)) };
  };
  const g = mode === 'run' ? s : 0;
  const fr = leap ? [30, 20] : crouch ? [120, 70] : [95 - 32 * g, 95 - 20 * g];
  const ff = leap ? [40, 30] : crouch ? [110, 75] : [95 + 32 * g, 95 + 25 * g];
  const hr = leap ? [150, 160] : crouch ? [60, 140] : [70 + 30 * g, 120 + 20 * g];
  const hf = leap ? [140, 150] : crouch ? [55, 135] : [70 - 30 * g, 120 - 15 * g];
  const frontN = leg(plus(shoulder, v(0.5, 2)), fr[0]!, fr[1]!, 4.2, 4.2);
  const frontF = leg(plus(shoulder, v(-1, 2)), ff[0]!, ff[1]!, 4.2, 4.2);
  const hindN = leg(plus(hip, v(0.5, 1.5)), hr[0]!, hr[1]!, 4, 4.4);
  const hindF = leg(plus(hip, v(-1, 1.5)), hf[0]!, hf[1]!, 4, 4.4);
  const eyeAt = plus(head, polar(-30, 1));
  const parts = [
    cap('tail', hip, tailA, 1, 0.8, fur, 0.5, -1), cap('tail2', tailA, tailB, 0.8, 0.5, fur, 0.51, -1),
    cap('fF1', frontF.root, frontF.mid, 1.1, 0.9, fur, 1, -1), cap('fF2', frontF.mid, frontF.foot, 0.9, 0.7, fur, 1.01, -1), cap('fF3', frontF.foot, frontF.toe, 0.7, 0.6, fur, 1.02, -1),
    cap('hF1', hindF.root, hindF.mid, 1.5, 1, fur, 1, -1), cap('hF2', hindF.mid, hindF.foot, 0.9, 0.7, fur, 1.01, -1), cap('hF3', hindF.foot, hindF.toe, 0.7, 0.6, fur, 1.02, -1),
    cap('body', hip, shoulder, 2.6, 3.4, fur, 3), cap('belly', plus(hip, v(2, 1.5)), plus(shoulder, v(-1.5, 1.8)), 1.4, 1.8, belly, 2.9),
    cap('neck', shoulder, neck, 2.4, 1.8, fur, 3.5), cap('head', neck, head, 1.8, 2, fur, 4), cap('snout', head, snout, 1.4, 0.9, fur, 4.05),
    cap('ear', head, ear, 0.9, 0.5, fur, 3.9, -1), cap('fang', plus(snout, v(-1.2, 1)), plus(snout, v(-1, 1.8)), 0.4, 0.3, fang, 4.1),
    ...(bite ? [cap('jaw', head, jaw, 1.1, 0.7, fur, 4.02), cap('fangLow', plus(jaw, v(-0.6, -1)), plus(jaw, v(-0.4, -1.8)), 0.4, 0.3, fang, 4.1)] : []),
    cap('eye', eyeAt, eyeAt, 0.5, 0.5, eyeR, 4.2),
    cap('fN1', frontN.root, frontN.mid, 1.2, 0.95, fur, 5), cap('fN2', frontN.mid, frontN.foot, 0.95, 0.75, fur, 5.01), cap('fN3', frontN.foot, frontN.toe, 0.75, 0.6, fur, 5.02),
    cap('hN1', hindN.root, hindN.mid, 1.6, 1.05, fur, 5), cap('hN2', hindN.mid, hindN.foot, 0.95, 0.75, fur, 5.01), cap('hN3', hindN.foot, hindN.toe, 0.75, 0.6, fur, 5.02),
  ];
  return stand(parts, [frontN.toe, hindN.toe, frontF.toe, hindF.toe], leap ? HOUND_H - 4 : HOUND_H - 1);
}

// ---------------------------------------------------------------- gargoyle: a stone watcher on its plinth (24 x 28)

export const GARGOYLE_W = 24, GARGOYLE_H = 28;
export function gargoyle(t: number, mode: 'stone' | 'aim' | 'hurt'): Part[] {
  const stone = R('ktTuU'), dark = R('kktTT'), eyeR = R(mode === 'aim' && t < 0.5 ? 'EEEEE' : 'eeeEE'), maw = R('xdDeE');
  const lift = mode === 'aim' ? -1 : 0;
  const lean = mode === 'hurt' ? -12 : mode === 'aim' ? 10 : 0;
  const base = 26;
  const hip = v(11, base - 9 + lift);
  const chest = plus(hip, polar(-75 + lean, 6));
  const head = plus(chest, polar(-30 + lean, 4));
  const parts: Part[] = [
    poly('plinth', [v(4, base - 4), v(20, base - 4), v(21, base + 2), v(3, base + 2)], 0.6, dark, 0),
    poly('wingF', [plus(chest, v(-2, -1)), plus(chest, v(-10, -9)), plus(chest, v(-9, -4)), plus(chest, v(-12, -2)), plus(hip, v(-6, 0)), plus(hip, v(-1, 0))], 0.6, dark, 0.5),
    cap('thighF', hip, plus(hip, v(4, 2)), 2.4, 1.8, stone, 1, -1), cap('shinF', plus(hip, v(4, 2)), plus(hip, v(3, 7.5)), 1.6, 1.3, stone, 1.01, -1),
    cap('torso', hip, chest, 3.4, 3.8, stone, 3),
    poly('wingN', [plus(chest, v(-1, -1.5)), plus(chest, v(-7, -10)), plus(chest, v(-5, -5)), plus(chest, v(-8, -3)), plus(hip, v(-4, 1)), plus(hip, v(0, 0))], 0.6, stone, 3.2),
    cap('head', chest, head, 2.6, 2.8, stone, 4),
    cap('hornA', plus(head, v(-1, -2)), plus(head, v(-4, -5)), 0.9, 0.4, dark, 4.1),
    cap('snout', head, plus(head, polar(20 + lean, 3)), 1.6, 1.2, stone, 4.05),
    cap('eye', plus(head, v(0.8, -0.8)), plus(head, v(0.8, -0.8)), 0.6, 0.6, eyeR, 4.3),
    ...(mode === 'aim' ? [cap('maw', plus(head, polar(30 + lean, 2.6)), plus(head, polar(30 + lean, 2.6)), 0.9, 0.9, maw, 4.25)] : []),
    cap('thighN', plus(hip, v(1, 1)), plus(hip, v(6, 3)), 2.6, 1.9, stone, 5), cap('shinN', plus(hip, v(6, 3)), plus(hip, v(5, 8.5)), 1.7, 1.4, stone, 5.01),
    cap('armN', plus(chest, v(1, 1)), plus(chest, v(4, 6)), 1.5, 1.2, stone, 6), cap('clawN', plus(chest, v(4, 6)), plus(chest, v(6, 8.5)), 1, 0.5, stone, 6.01),
  ];
  return parts;
}

// ---------------------------------------------------------------- sentinel: a shield-bearer in lacquered plate (72 x 52)

export const SENTINEL_W = 72, SENTINEL_H = 52;
/**
 * The thrust by frame: the spear drawn back over the shoulder, its point raised, the body coiled behind the shield (the
 * wind-up a player reads); then driven out over the shield's rim with a step, held, and drawn back. Lean, the grip's
 * reach ahead of the shoulder, the spear's angle (0 ahead, 90 down) and the pelvis's step.
 */
const THRUST = [
  { lean: -5, reach: -2, a: -6, dx: 0 },
  { lean: -10, reach: -8, a: -14, dx: -1 },
  { lean: 12, reach: 15, a: 8, dx: 3 },
  { lean: 14, reach: 16, a: 9, dx: 4 },
  { lean: 4, reach: 6, a: 6, dx: 1 },
] as const;
export type SentinelMode = 'guard' | 'walk' | 'thrust' | 'block' | 'hurt';
export function sentinel(t: number, mode: SentinelMode): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  // Crimson-lacquered plate over dark iron joints and mail, a gold-bossed tower shield of dark wood rimmed in iron, a
  // steel spear point, an ember slit in the great helm.
  const plate = R('kxxdD'), plateDark = R('kkxxd'), iron = R('kktTu'), mail = R('kkktT'), wood = R('kpqQr'), rim = R('kktTu'), gold = R('aaAbB'), steel = R('tTuUw'), ember = R('EEEEE');
  const k = mode === 'thrust' ? THRUST[Math.min(THRUST.length - 1, Math.round(t * THRUST.length))]! : null;
  const walk = mode === 'walk', hurt = mode === 'hurt', block = mode === 'block';
  const lean = k ? k.lean : hurt ? -16 : block ? 8 : walk ? 4 : 2;
  const breathe = mode === 'guard' ? s * 0.6 : 0;
  const pelvis = v(34 + (k ? k.dx : 0) + (block ? -1 : 0), 30 - (walk ? Math.abs(c) * 0.9 : 0));
  const chest = plus(pelvis, polar(-90 + lean, 12 + breathe * 0.4));
  const neck = plus(chest, polar(-90 + lean * 0.6, 3));
  const head = plus(neck, polar(-90 + lean * 0.3 + (block ? 10 : 0), 3.6));
  // Legs: a wide planted stance; walking, a slow heavy tread.
  const leg = (phase: number, dx: number) => {
    const hip = plus(pelvis, v(dx, 1));
    const a = 90 + (walk ? 18 * phase : dx * 2.4);
    const knee = plus(hip, polar(a - 12, 9));
    const ankle = plus(knee, polar(a + 12 + (walk ? 14 * Math.max(0, -phase) : 0), 9.5));
    return { hip, knee, ankle, toe: plus(ankle, v(3.4, 0.6)) };
  };
  const stride = k ? 0.95 : block ? 0.9 : 0.6;
  const nl = leg(walk ? s : stride, 3), fl = leg(walk ? -s : -stride, -3);
  // The far arm holds the spear overhand, over the shield's rim; the near arm holds the shield before the body.
  const shF = plus(chest, v(-2, 1)), shN = plus(chest, v(2.5, 2));
  const spearA = hurt ? -50 : block ? 4 : k ? k.a : -4 + (walk ? s * 2 : 0);
  const reach = hurt ? -6 : block ? -4 : k ? k.reach : 3;
  const grip = plus(shF, v(5 + reach, -3 + Math.abs(reach) * 0.08));
  const elbowF = plus(shF, v(-3 + reach * 0.5, 4 - Math.max(0, reach) * 0.1));
  const butt = plus(grip, polar(spearA + 180, 13));
  const point = plus(grip, polar(spearA, 17));
  const tip = plus(point, polar(spearA, 6.5));
  // The shield: from the knees to the chin before the body; pushed out when it blocks, swung aside when struck.
  // Thrusting, the shield arm swings back to drive the spear: the shield lowers and tips open, baring the chest, through
  // the thrust and its recovery (the opening).
  const open = k !== null && k.reach > 5;
  const sc = plus(pelvis, v(hurt ? 4 : block ? 9.5 : open ? 5 : 8, hurt ? -3 : open ? 1 : -2));
  const tilt = hurt ? -34 : block ? 4 : open ? 16 : 0;
  const corner = (dx: number, dy: number) => plus(sc, polar(tilt + Math.atan2(dy, dx) * (180 / Math.PI), Math.hypot(dx, dy)));
  const shield = [corner(-3, -13.5), corner(3.2, -12.5), corner(4.6, -4), corner(4.6, 7), corner(1.2, 12.5), corner(-2.6, 12), corner(-3, -4)];
  const elbowN = plus(shN, v(3, 6));
  const parts: Part[] = [
    // The far side: the spear's leg and arm, darker, and the spear itself, over the shield's rim.
    cap('thighF', fl.hip, fl.knee, 2.8, 2.3, plateDark, 1, -1), cap('kneeF', fl.knee, fl.knee, 1.8, 1.8, iron, 1.005, -1), cap('shinF', fl.knee, fl.ankle, 2.3, 2, plateDark, 1.01, -1), cap('footF', fl.ankle, fl.toe, 1.7, 1.3, iron, 1.02, -1),
    cap('upperF', shF, elbowF, 2.3, 1.9, plateDark, 1.2, -1), cap('foreF', elbowF, grip, 1.9, 1.6, iron, 1.21, -1),
    // The body: plate over a skirt of mail.
    poly('mail', [plus(pelvis, v(-5.5, -2)), plus(pelvis, v(5.5, -2)), plus(pelvis, v(6, 7 + (walk ? s * 0.6 : 0))), plus(pelvis, v(-6, 7 - (walk ? s * 0.6 : 0)))], 0.8, mail, 2),
    cap('torso', pelvis, chest, 5.4, 6.6, plate, 3),
    cap('belt', plus(pelvis, v(-5, -1)), plus(pelvis, v(5, -1)), 1, 1, iron, 3.1),
    cap('neck', chest, neck, 2.8, 2.6, iron, 3.4),
    // The great helm: tall, a ridge crest, the ember slit across its face.
    cap('helm', neck, head, 4.2, 4.4, plate, 4),
    cap('crown', plus(head, polar(-90 + lean * 0.3, 2.5)), plus(head, polar(-100 + lean * 0.3, 5.5)), 3.4, 1.6, plate, 4.02),
    cap('crest', plus(head, polar(-60 + lean * 0.3, 5)), plus(head, polar(-150 + lean * 0.3, 6.5)), 1.1, 0.8, plateDark, 4.05),
    cap('faceplate', plus(head, polar(-15 + lean * 0.3, 2.2)), plus(head, polar(30 + lean * 0.3, 3)), 1.6, 1.4, iron, 4.1),
    cap('slit', plus(head, polar(-12 + lean * 0.3, 2.6)), plus(head, polar(-12 + lean * 0.3, 4.2)), 0.5, 0.5, ember, 4.2),
    cap('pauldron', plus(chest, v(0, 0)), plus(chest, v(3.5, 2.5)), 3.8, 3, plate, 4.3),
    cap('spike', plus(chest, v(0.5, -2.5)), plus(chest, v(-1.5, -6)), 1.1, 0.4, iron, 4.31),
    // The near side: the leg, the shield before everything, and the spear over its rim.
    cap('thighN', nl.hip, nl.knee, 3, 2.5, plate, 5), cap('kneeN', nl.knee, nl.knee, 1.9, 1.9, iron, 5.005), cap('shinN', nl.knee, nl.ankle, 2.5, 2.1, plate, 5.01), cap('footN', nl.ankle, nl.toe, 1.8, 1.4, iron, 5.02),
    cap('upperN', shN, elbowN, 2.4, 2.1, plate, 5.5),
    poly('shield', shield, 1.2, wood, 6),
    cap('rimTop', shield[0]!, shield[1]!, 0.9, 0.9, rim, 6.1), cap('rimFront', shield[2]!, shield[3]!, 0.9, 0.9, rim, 6.1), cap('rimFoot', shield[4]!, shield[5]!, 0.9, 0.9, rim, 6.1),
    cap('boss', plus(sc, v(1.6, -2.5)), plus(sc, v(1.6, -2.5)), 1.9, 1.9, gold, 6.2),
    cap('band', plus(sc, v(1.4, 3.5)), plus(sc, v(1.4, 8.5)), 0.6, 0.6, gold, 6.15),
    cap('shaft', butt, point, 0.75, 0.75, wood, 6.5),
    poly('point', [plus(point, polar(spearA - 90, 1.7)), tip, plus(point, polar(spearA + 90, 1.7)), plus(point, polar(spearA + 180, 1.3))], 0.3, steel, 6.51),
    cap('fist', grip, grip, 1.7, 1.7, iron, 6.6),
  ];
  return stand(parts, [nl.ankle, fl.ankle, nl.toe, fl.toe], SENTINEL_H - 1);
}

// ---------------------------------------------------------------- wraith: a hooded shroud of ghost-fire (36 x 44)

export const WRAITH_W = 36, WRAITH_H = 44;
/** The cast by frame: the hands gather at the chest, rise with the hex over the hood (the wind-up), push it out, hold, settle. */
const CAST = [
  { arm: 70, lift: 0, orb: 1.2, at: 'chest' },
  { arm: -60, lift: -1, orb: 2.4, at: 'over' },
  { arm: 8, lift: 0, orb: 0, at: 'none' },
  { arm: 12, lift: 0, orb: 0, at: 'none' },
  { arm: 50, lift: 0, orb: 0, at: 'none' },
] as const;
/** The fade by frame: how much of the shroud is left (1 whole, 0 only the eyes). */
const FADE = [1, 0.62, 0.3, 0, 0.3, 0.62] as const;
export type WraithMode = 'idle' | 'cast' | 'fade' | 'hurt';
export function wraith(t: number, mode: WraithMode): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  // A shroud black-green to the hem, ghost-fire in its wisps and eyes, pale grey bone for hands.
  const shroud = R('kkkov'), hem = R('kovVy'), wisp = R('oVyYw'), dark = R('kkkkk'), eye = R('Ywwww'), bone = R('tTuUw'), fire = R('VyYww');
  const k = mode === 'cast' ? CAST[Math.min(CAST.length - 1, Math.round(t * CAST.length))]! : null;
  const left = mode === 'fade' ? FADE[Math.min(FADE.length - 1, Math.round(t * FADE.length))]! : 1;
  const hurt = mode === 'hurt';
  const bob = mode === 'idle' ? s * 0.8 : 0;
  const lean = hurt ? -18 : k && k.at === 'none' ? 10 : 0;
  // The figure from the hood down: its waist floats over the frame's lower third.
  const waist = v(18, 26 + bob + (k ? k.lift : 0));
  const chest = plus(waist, polar(-90 + lean, 8));
  const head = plus(chest, polar(-90 + lean * 0.8, 6));
  const parts: Part[] = [];
  if (left > 0) {
    // The shroud: a bell from the shoulders, the hem frayed into three wisps that sway.
    const hemY = 34 + bob;
    const body = [plus(chest, v(-4.5, -1)), plus(chest, v(4.5, -1)), v(waist.x + 6, waist.y + 2), v(waist.x + 7.5, hemY), v(waist.x - 7.5, hemY), v(waist.x - 6, waist.y + 2)];
    const scale = (p: Vec) => v(waist.x + (p.x - waist.x) * (0.55 + 0.45 * left), p.y);
    parts.push(poly('shroud', (left < 1 ? body.map(scale) : body).slice(), 1.2, shroud, 2));
    // The hem burns: a band of ghost-fire where the shroud frays.
    parts.push(cap('hem', v(waist.x - 7 * (0.55 + 0.45 * left), hemY - 1), v(waist.x + 7 * (0.55 + 0.45 * left), hemY - 1), 1.3, 1.3, hem, 2.05));
    for (const [i, dx] of [-5, 0, 5].entries()) {
      const sway = (mode === 'idle' ? Math.sin((t + i / 3) * Math.PI * 2) : c) * 1.6;
      const from = v(waist.x + dx * left, hemY - 1);
      const to = plus(from, v(sway - 1.5, (6 + (i === 1 ? 3 : 0)) * left));
      parts.push(cap(`wisp${i}`, from, to, 1.5 * left + 0.4, 0.3, wisp, 2.1));
    }
    if (left >= 0.6) {
      // Sleeves from the shoulders, bony hands.
      const arm = (side: number, depth: number) => {
        const sh = plus(chest, v(side * 2.5, 1));
        const a = hurt ? -140 + side * 20 : k ? k.arm + side * 8 : 70 + side * 6 + s * 4;
        const el = plus(sh, polar(a, 5));
        const hand = plus(el, polar(a + (k && k.at === 'over' ? 20 : 18), 4.5));
        parts.push(cap(`sleeve${side}`, sh, el, 2, 1.6, shroud, depth), cap(`fore${side}`, el, hand, 1.5, 1.1, shroud, depth + 0.01), cap(`hand${side}`, hand, plus(hand, polar(a + 30, 1.6)), 0.8, 0.5, bone, depth + 0.02));
        return hand;
      };
      arm(-1, 1.8);
      const hand = arm(1, 4.5);
      if (k && k.orb > 0) {
        const at = k.at === 'over' ? plus(head, v(4, -5.5)) : plus(hand, v(1.5, -1));
        parts.push(cap('hex', at, at, k.orb + 0.6, k.orb + 0.6, fire, 5), cap('hexCore', at, at, k.orb * 0.45, k.orb * 0.45, R('wwwww'), 5.1));
      }
    }
    // The hood, peaked, with the dark of the face open toward the front.
    parts.push(cap('hood', chest, head, 4.4, 4.2, shroud, 3), cap('peak', head, plus(head, polar(-120 + lean, 5.5)), 2.2, 0.6, shroud, 3.05));
    parts.push(cap('face', plus(head, v(1.2, 0.8)), plus(head, v(2.4, 1.8)), 2.6, 2.2, dark, 3.1));
  }
  // The eyes stay longest as it fades: two cold points of ghost-fire.
  const eyes = plus(head, v(2.6, 0.6));
  parts.push(cap('eyeN', eyes, eyes, 0.6, 0.6, eye, 3.2), cap('eyeF', plus(eyes, v(-1.8, 0.2)), plus(eyes, v(-1.8, 0.2)), 0.5, 0.5, eye, 3.15));
  return parts;
}

// ---------------------------------------------------------------- archer: a bone archer in a torn hood (36 x 40)

export const ARCHER_W = 36, ARCHER_H = 40;
/**
 * The draw by frame: an arrow nocked low, the bow raised, the string drawn back to the jaw, held at full draw (the
 * wind-up a player reads), loosed, and lowered. Bow arm angle (0 ahead), how far the string is drawn, the arrow on it.
 */
const DRAW = [
  { a: 50, pull: 1, arrow: true },
  { a: 12, pull: 2, arrow: true },
  { a: 0, pull: 6, arrow: true },
  { a: -2, pull: 8.5, arrow: true },
  { a: 0, pull: 0, arrow: false },
  { a: 30, pull: 0, arrow: false },
] as const;
export type ArcherMode = 'walk' | 'draw' | 'hurt';
export function archer(t: number, mode: ArcherMode): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  // Aged bone, a torn crimson cowl and rags, a dark wood bow, an ember in each eye.
  const bone = R('tuUUw'), boneDark = R('ttuUU'), cowl = R('kxxdD'), wood = R('kkpqQ'), string = R('TTuUU'), steel = R('tTuUw'), ember = R('EEEEE');
  const k = mode === 'draw' ? DRAW[Math.min(DRAW.length - 1, Math.round(t * DRAW.length))]! : null;
  const walk = mode === 'walk', hurt = mode === 'hurt';
  const lean = hurt ? -16 : k ? -4 : 6;
  const pelvis = v(17, 22 - (walk ? Math.abs(c) * 0.8 : 0));
  const chest = plus(pelvis, polar(-90 + lean, 8));
  const neck = plus(chest, polar(-90 + lean, 2.4));
  const head = plus(neck, polar(-90 + lean * 0.5, 2.6));
  const leg = (phase: number, dx: number) => {
    const hip = plus(pelvis, v(dx, 0.5));
    const a = 92 + (walk ? 22 * phase : dx * 5);
    const knee = plus(hip, polar(a - 8, 7));
    const ankle = plus(knee, polar(a + 10 + (walk ? 14 * Math.max(0, -phase) : 0), 7.5));
    return { hip, knee, ankle, toe: plus(ankle, v(2.6, 0.4)) };
  };
  const stance = k ? 0.8 : 0.4;
  const nl = leg(walk ? s : stance, 1.5), fl = leg(walk ? -s : -stance, -1.5);
  // The bow arm reaches ahead to the bow; the drawing hand pulls the string back toward the jaw.
  const shB = plus(chest, v(1.5, 1)), shD = plus(chest, v(-1.5, 1));
  const bowA = hurt ? 70 : k ? k.a : 60 + s * 6;
  const grip = plus(shB, polar(bowA, 10));
  const elB = plus(shB, polar(bowA + 6, 5));
  const up = polar(bowA - 90, 1), down = polar(bowA + 90, 1);
  const tipU = plus(grip, v(up.x * 11 - 2.5, up.y * 11)), tipD = plus(grip, v(down.x * 11 - 2.5, down.y * 11));
  const pull = k ? k.pull : 0;
  const nock = plus(grip, polar(bowA + 180, 1 + pull));
  const hand = k && pull > 0 ? nock : plus(shD, polar(hurt ? -120 : 100, 9));
  const elD = plus(shD, polar(k && pull > 0 ? 160 : 110, 4));
  const parts: Part[] = [
    cap('thighF', fl.hip, fl.knee, 1.1, 0.9, boneDark, 1, -1), cap('shinF', fl.knee, fl.ankle, 0.9, 0.8, boneDark, 1.01, -1), cap('footF', fl.ankle, fl.toe, 0.8, 0.6, boneDark, 1.02, -1),
    cap('upperD', shD, elD, 1, 0.9, boneDark, 1.2, -1), cap('foreD', elD, hand, 0.9, 0.8, boneDark, 1.21, -1),
    // A spine and ribs under the cowl's rags, the pelvis.
    cap('spine', pelvis, chest, 0.9, 0.9, bone, 2),
    cap('ribs', plus(chest, v(0, 0.5)), plus(chest, v(0.5, 3.5)), 2.6, 2, bone, 2.1),
    cap('pelvis', plus(pelvis, v(-1.8, 0)), plus(pelvis, v(1.8, 0)), 1.6, 1.6, bone, 2.05),
    poly('rags', [plus(pelvis, v(-3, -0.5)), plus(pelvis, v(3, -0.5)), plus(pelvis, v(3.5, 4 + (walk ? s : 0))), plus(pelvis, v(1, 6)), plus(pelvis, v(-1, 4.5)), plus(pelvis, v(-3.5, 6.5 - (walk ? s : 0)))], 0.6, cowl, 2.2),
    // The cowl over the shoulders and the skull, the face open, ember eyes.
    poly('mantle', [plus(chest, v(-4, 0)), plus(chest, v(4, 0.5)), plus(chest, v(3.5, 5)), plus(chest, v(0, 4)), plus(chest, v(-3, 6.5))], 0.8, cowl, 3),
    cap('skull', neck, head, 2.2, 2.6, bone, 4),
    cap('jaw', plus(head, polar(60 + lean, 1.6)), plus(head, polar(70 + lean, 3)), 1.2, 0.9, bone, 4.05),
    cap('hood', plus(head, v(-1.6, -0.8)), plus(head, polar(-150 + lean, 3.4)), 2.4, 1.2, cowl, 4.1),
    cap('socket', plus(head, v(1.2, -0.2)), plus(head, v(1.2, -0.2)), 0.9, 0.9, R('kkkkk'), 4.15),
    cap('eye', plus(head, v(1.3, -0.2)), plus(head, v(1.3, -0.2)), 0.6, 0.6, ember, 4.2),
    cap('thighN', nl.hip, nl.knee, 1.2, 1, bone, 5), cap('shinN', nl.knee, nl.ankle, 1, 0.85, bone, 5.01), cap('footN', nl.ankle, nl.toe, 0.85, 0.6, bone, 5.02),
    // The bow before the body: two limbs from the grip, the string to the nock (or straight when slack), the arrow.
    cap('limbU', grip, tipU, 0.9, 0.5, wood, 6), cap('limbD', grip, tipD, 0.9, 0.5, wood, 6),
    cap('stringU', tipU, k && pull > 0 ? nock : tipD, 0.3, 0.3, string, 6.1),
    ...(k && pull > 0 ? [cap('stringD', nock, tipD, 0.3, 0.3, string, 6.1)] : []),
    ...(k && k.arrow ? [cap('arrow', nock, plus(grip, polar(bowA, 4)), 0.4, 0.4, wood, 6.2), cap('head', plus(grip, polar(bowA, 4)), plus(grip, polar(bowA, 6.5)), 0.8, 0.2, steel, 6.25)] : []),
    cap('upperB', shB, elB, 1, 0.9, bone, 6.5), cap('foreB', elB, grip, 0.9, 0.8, bone, 6.51),
  ];
  return stand(parts, [nl.ankle, fl.ankle, nl.toe, fl.toe], ARCHER_H - 1);
}

// ---------------------------------------------------------------- the shots: a hex of ghost-fire (10 x 10)

export function hex(t: number): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  return [
    cap('trail', v(2 + s * 0.4, 5 + c * 0.4), v(5, 5), 1.6, 2.2, R('kovVy'), 1),
    cap('orb', v(6, 5), v(6, 5), 3.2, 3.2, R('vVyYw'), 2),
    cap('core', v(6.5, 4.6), v(6.5, 4.6), 1.3, 1.3, R('Ywwww'), 3),
  ];
}

// ---------------------------------------------------------------- headsman: the region's boss, a giant executioner (168 x 112)

/**
 * The headsman's frames by clip: a pose each (the body's lean and crouch, the near arm that swings the cleaver, the
 * cleaver's angle, the far arm, legs tucked in a leap or a knee on the floor), shaded by the cast's rasterizer.
 */
export const HEADSMAN_W = 168, HEADSMAN_H = 112;
/** A pose: the body's lean and crouch, the near arm (shoulder angle, elbow bend) that swings the cleaver, the cleaver's angle. */
interface HeadsmanPose { lean: number; crouch: number; dx: number; arm: number; bend: number; blade: number; head: number; legs: number; kneel?: boolean; tuck?: number; armF?: number }
const HEADSMAN_STANCE: HeadsmanPose = { lean: 8, crouch: 0, dx: 0, arm: 70, bend: 60, blade: -60, head: 6, legs: 0.5 };
const HEADSMAN_POSES: Record<string, HeadsmanPose> = {
  idle: HEADSMAN_STANCE,
  raise: { lean: -10, crouch: 1, dx: -2, arm: -120, bend: -40, blade: -170, head: -8, legs: 0.7 },
  chop: { lean: 30, crouch: 6, dx: 8, arm: 40, bend: -10, blade: 60, head: 14, legs: 1 },
  buried: { lean: 34, crouch: 8, dx: 10, arm: 60, bend: -5, blade: 88, head: 20, legs: 1 },
  kneel: { lean: 26, crouch: 18, dx: 0, arm: 85, bend: 20, blade: 95, head: 36, legs: 1, kneel: true },
};
const blend = (a: HeadsmanPose, b: HeadsmanPose, t: number): HeadsmanPose => ({
  lean: a.lean + (b.lean - a.lean) * t, crouch: a.crouch + (b.crouch - a.crouch) * t, dx: a.dx + (b.dx - a.dx) * t, arm: a.arm + (b.arm - a.arm) * t,
  bend: a.bend + (b.bend - a.bend) * t, blade: a.blade + (b.blade - a.blade) * t, head: a.head + (b.head - a.head) * t, legs: a.legs + (b.legs - a.legs) * t,
  kneel: t < 0.5 ? a.kneel : b.kneel, tuck: (a.tuck ?? 0) + ((b.tuck ?? 0) - (a.tuck ?? 0)) * t, armF: (a.armF ?? 110) + ((b.armF ?? 110) - (a.armF ?? 110)) * t,
});
/** Each clip, frame by frame. */
const HEADSMAN_CLIPS: Record<string, HeadsmanPose[]> = {
  kneel: [HEADSMAN_POSES.kneel!],
  walk: [0, 1, 2, 3].map((i) => ({ ...HEADSMAN_STANCE, legs: 0.5 + 0.35 * Math.sin((i / 4) * Math.PI * 2), crouch: Math.abs(Math.cos((i / 4) * Math.PI * 2)) * 1.2, lean: 10 })),
  rise: [HEADSMAN_POSES.kneel!, blend(HEADSMAN_POSES.kneel!, HEADSMAN_STANCE, 0.35), blend(HEADSMAN_POSES.kneel!, HEADSMAN_STANCE, 0.7), { ...HEADSMAN_STANCE, lean: -6, head: -14, arm: -40, bend: -30, blade: -120 }, { ...HEADSMAN_STANCE, lean: -4, head: -10, arm: -20, bend: -20, blade: -100 }, HEADSMAN_STANCE],
  chop: [blend(HEADSMAN_STANCE, HEADSMAN_POSES.raise!, 0.5), HEADSMAN_POSES.raise!, HEADSMAN_POSES.chop!, HEADSMAN_POSES.buried!, blend(HEADSMAN_POSES.buried!, HEADSMAN_STANCE, 0.5)],
  leap: [
    { ...HEADSMAN_STANCE, crouch: 9, lean: 22, legs: 0.9, arm: 100, bend: 30, blade: 40 },
    { ...HEADSMAN_STANCE, crouch: 0, lean: -6, legs: 0.3, arm: -110, bend: -40, blade: -160, tuck: 6 },
    { ...HEADSMAN_POSES.raise!, tuck: 12, legs: 0.6 },
    { ...HEADSMAN_POSES.chop!, tuck: 8, crouch: 0, blade: 80 },
    { ...HEADSMAN_POSES.buried!, crouch: 12, legs: 1.2 },
  ],
  drag: [
    { ...HEADSMAN_STANCE, lean: 16, arm: 150, bend: 20, blade: 170, crouch: 4, legs: 0.9 },
    { ...HEADSMAN_STANCE, lean: 22, arm: 135, bend: 10, blade: 175, crouch: 7, legs: 1.1 },
    { ...HEADSMAN_STANCE, lean: 28, arm: 50, bend: -10, blade: 15, crouch: 7, dx: 6, legs: 1.1 },
    { ...HEADSMAN_STANCE, lean: 22, arm: 10, bend: -20, blade: -10, crouch: 5, dx: 8, legs: 1 },
    blend({ ...HEADSMAN_STANCE, lean: 22, arm: 10, bend: -20, blade: -10, crouch: 5, dx: 8, legs: 1 }, HEADSMAN_STANCE, 0.5),
  ],
  roar: [
    { ...HEADSMAN_STANCE, lean: -12, head: -30, arm: 30, bend: -40, blade: -30, armF: 200, legs: 0.9 },
    { ...HEADSMAN_STANCE, lean: -18, head: -40, arm: 10, bend: -50, blade: -40, armF: 220, legs: 1 },
    { ...HEADSMAN_STANCE, lean: -6, head: -16, arm: 40, bend: 0, blade: -40, armF: 160, legs: 0.8 },
  ],
  combo: [
    { ...HEADSMAN_STANCE, lean: 0, arm: 170, bend: 30, blade: 190, crouch: 5, legs: 0.9 },
    { ...HEADSMAN_STANCE, lean: 26, arm: 30, bend: -30, blade: 20, crouch: 6, dx: 8, legs: 1.1 },
    { ...HEADSMAN_STANCE, lean: 18, arm: -10, bend: -40, blade: -30, crouch: 3, dx: 8, legs: 1 },
    { ...HEADSMAN_POSES.raise!, dx: 6 },
    { ...HEADSMAN_POSES.chop!, dx: 12 },
    { ...HEADSMAN_POSES.buried!, dx: 13 },
  ],
  hurt: [{ ...HEADSMAN_STANCE, lean: -18, head: -20, arm: 120, bend: 70, blade: 30, crouch: 3, legs: 0.8 }],
};
export function headsman(p: HeadsmanPose): Part[] {
  // Blackened iron, grey dead flesh, a leather apron, a tattered crimson tabard, rust-bitten cleaver steel with a bright
  // edge, ember eyes in the grille.
  const iron = R('kktTu'), ironDark = R('kkktT'), leather = R('kpqQr'), tabard = R('kxxdD'), steel = R('tTuUw'), rust = R('kxpqQ'), ember = R('EEEEE'), flesh = R('kpqQr');
  const pelvis = v(80 + p.dx, 58 + p.crouch);
  const chest = plus(pelvis, polar(-90 + p.lean, 22));
  const neck = plus(chest, polar(-90 + p.lean * 0.7, 4));
  const head = plus(neck, polar(-90 + p.lean * 0.5 + p.head, 7));
  const leg = (dx: number, spread: number, down: boolean) => {
    const hip = plus(pelvis, v(dx, 2));
    if (down) {
      // The knee on the floor, the shin back along it.
      const knee = v(hip.x + 4, hip.y + 15);
      const ankle = v(knee.x - 14, knee.y + 1);
      return { hip, knee, ankle, toe: plus(ankle, v(-3, 2)) };
    }
    const s = Math.sign(dx || 1);
    const tuck = p.tuck ?? 0;
    const knee = plus(hip, polar(90 - spread * 22 * s + p.crouch * 1.6 * s - tuck * 4, 15));
    const ankle = plus(knee, polar(90 + spread * 10 * s + tuck * 7, 16 - p.crouch * 0.3));
    return { hip, knee, ankle, toe: plus(ankle, v(6, 1)) };
  };
  const nl = leg(5, p.legs, p.kneel === true), fl = leg(-5, p.legs, false);
  const shN = plus(chest, v(4, 4)), shF = plus(chest, v(-6, 4));
  const elbow = plus(shN, polar(p.arm, 16));
  const hand = plus(elbow, polar(p.arm - p.bend, 15));
  const haftEnd = plus(hand, polar(p.blade, 14));
  const bladeBase = plus(hand, polar(p.blade, 10));
  const bladeTip = plus(hand, polar(p.blade, 46));
  const n = polar(p.blade + 90, 1);
  const blade = [plus(bladeBase, v(n.x * -2, n.y * -2)), plus(bladeTip, v(n.x * -3, n.y * -3)), plus(bladeTip, v(n.x * 13, n.y * 13)), plus(bladeBase, v(n.x * 15, n.y * 15))];
  const elbowF = plus(shF, polar((p.armF ?? 110) - p.lean * 0.5, 15));
  const handF = plus(elbowF, polar(80, 13));
  // The tabard hangs from the shoulders behind, ragged at the hem.
  const back = plus(chest, v(-10, -2));
  const hem = (dx: number, dy: number) => plus(pelvis, v(dx - p.lean * 0.25, dy));
  const parts: Part[] = [
    poly('tabard', [plus(back, v(-2, 0)), plus(back, v(10, -2)), hem(-2, 16), hem(-8, 22), hem(-12, 17), hem(-18, 23), hem(-20, 12)], 1.5, tabard, 0.5),
    cap('thighF', fl.hip, fl.knee, 6, 5, ironDark, 1, -1), cap('shinF', fl.knee, fl.ankle, 5, 4.2, ironDark, 1.01, -1), cap('footF', fl.ankle, fl.toe, 3.6, 3, ironDark, 1.02, -1),
    cap('upperF', shF, elbowF, 6.5, 5.5, flesh, 1.5, -1), cap('foreF', elbowF, handF, 5.5, 4.6, flesh, 1.51, -1),
    cap('chainF', plus(elbowF, polar(80, 4)), plus(elbowF, polar(80, 10)), 5.6, 5, iron, 1.52, -1),
    cap('torso', pelvis, chest, 14, 17, iron, 3),
    poly('apron', [plus(pelvis, v(-12, -6)), plus(pelvis, v(12, -6)), plus(pelvis, v(14, 16)), plus(pelvis, v(-13, 18))], 2, leather, 3.2),
    cap('belt', plus(pelvis, v(-13, -5)), plus(pelvis, v(13, -5)), 2.4, 2.4, ironDark, 3.3),
    cap('neck', chest, neck, 7, 6, iron, 3.5),
    // A tall bucket helm crowned with iron spikes, a black grille, two embers behind it.
    cap('helm', plus(neck, polar(-90 + p.lean * 0.5 + p.head, 1)), head, 9, 8.5, iron, 4),
    ...[-6, -2, 2, 6].map((dx, i) => cap(`spike${i}`, plus(head, v(dx * 0.9, -6.5)), plus(head, v(dx * 1.3, -12.5 + Math.abs(dx) * 0.5)), 1.8, 0.5, ironDark, 4.05)),
    cap('grille', plus(head, v(5, -3)), plus(head, v(6.5, 4)), 2.8, 2.6, R('kkkkt'), 4.1),
    cap('eyeN', plus(head, v(7, -0.5)), plus(head, v(7, -0.5)), 1.1, 1.1, ember, 4.2),
    cap('eyeF', plus(head, v(4.5, -0.8)), plus(head, v(4.5, -0.8)), 0.9, 0.9, ember, 4.15),
    cap('shoulder', plus(chest, v(0, 0)), plus(chest, v(7, 4)), 10, 8, iron, 4.5),
    cap('thighN', nl.hip, nl.knee, 6.5, 5.5, iron, 5), cap('shinN', nl.knee, nl.ankle, 5.5, 4.5, iron, 5.01), cap('footN', nl.ankle, nl.toe, 3.8, 3.2, iron, 5.02),
    cap('upperN', shN, elbow, 7, 6, flesh, 6), cap('foreN', elbow, hand, 6, 5, flesh, 6.01),
    cap('bracer', plus(elbow, polar(p.arm - p.bend, 5)), plus(elbow, polar(p.arm - p.bend, 12)), 6.2, 5.4, iron, 6.02),
    cap('haft', plus(hand, polar(p.blade + 180, 6)), haftEnd, 1.6, 1.6, leather, 6.5),
    poly('cleaver', blade, 1, rust, 6.6),
    cap('edge', blade[2]!, blade[3]!, 1.3, 1.3, steel, 6.65),
    cap('fist', hand, hand, 4.6, 4.6, flesh, 6.7),
  ];
  return stand(parts, [nl.ankle, fl.ankle, nl.toe, fl.toe, ...(p.kneel ? [nl.knee] : [])], HEADSMAN_H - 1);
}

// ---------------------------------------------------------------- wave: the drag's run of sparks along the floor (18 x 12)

export const WAVE_W = 18, WAVE_H = 12;
export function wave(t: number): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  return [
    cap('trail', v(2, 10), v(9, 9 + s * 0.5), 1.2, 2.2, R('kxdDe'), 1),
    cap('crest', v(8, 10), v(13 + c * 0.6, 4.5 + s), 2.6, 1.2, R('xdeEE'), 2),
    cap('core', v(12, 9.5), v(14, 7 + c * 0.5), 1.4, 0.8, R('eEbBw'), 3),
  ];
}

// ---------------------------------------------------------------- altar: a stone font with a flame (20 x 34)

export const ALTAR_W = 20, ALTAR_H = 34;
export function altar(t: number): Part[] {
  const stone = R('ktTuU'), gold = R('aaAbB'), flame = R('aAbBw');
  const [s] = sinCosDeg(t * 360);
  const b = 33;
  return [
    poly('step', [v(1, b - 3), v(19, b - 3), v(19.5, b + 1), v(0.5, b + 1)], 0.5, stone, 0),
    poly('foot', [v(4, b - 7), v(16, b - 7), v(17, b - 3), v(3, b - 3)], 0.5, stone, 1),
    poly('shaft', [v(6.5, b - 20), v(13.5, b - 20), v(14, b - 7), v(6, b - 7)], 0.4, stone, 1.5),
    cap('band', v(6.5, b - 14), v(13.5, b - 14), 0.8, 0.8, gold, 1.6),
    poly('bowl', [v(2.5, b - 24), v(17.5, b - 24), v(15, b - 20), v(5, b - 20)], 0.8, stone, 2),
    cap('rim', v(3, b - 24.5), v(17, b - 24.5), 0.9, 0.9, gold, 2.1),
    cap('flame', v(10, b - 26), v(10 + s * 0.8, b - 31 - s * 0.6), 2.6, 0.7, flame, 3),
    cap('core', v(10, b - 26), v(10, b - 28), 1, 0.4, R('BBwww'), 3.1),
  ];
}

// ---------------------------------------------------------------- people: a kneeling hermit (30 x 32), a candle-keeper (28 x 46)

export const HERMIT_W = 30, HERMIT_H = 32;
/** Kneels on one knee, a staff upright in the near hand, a lantern at its foot; breathes, the flame flickers. */
export function hermit(t: number): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  const robe = R('kOspq'), hood = R('kOOsp'), staff = R('kpqQr'), rope = R('pqQrR'), face = R('ktTuU'), iron = R('kkOsq'), glow = R('aAbBw');
  const breath = s * 0.35;
  const knee = v(17, 27), heel = v(9, 29), footN = v(19.5, 29);
  const hip = v(11, 22);
  const chest = v(13.5, 13 + breath);
  const head = plus(chest, polar(-70, 5.5));
  const parts: Part[] = [
    // The far leg kneeling: thigh to the knee on the floor, the shin back along it.
    cap('thighF', hip, knee, 3, 2.4, robe, 1),
    cap('shinF', knee, heel, 2.2, 1.8, robe, 0.9),
    // The robe's skirt pooled on the floor, the body bowed forward over it.
    poly('skirt', [v(5, 30), v(18, 30), v(17, 24), v(9, 20), v(5, 24)], 1, robe, 1.2),
    poly('body', [plus(hip, v(-3.5, 1)), plus(hip, v(3, 1)), plus(chest, v(3.2, 0)), plus(chest, v(-2, -2.5)), plus(chest, v(-4, 1))], 1.2, robe, 2),
    cap('belt', plus(hip, v(-3, -1.5)), plus(hip, v(3, -1)), 0.6, 0.6, rope, 2.2),
    // The near knee up, the foot flat on the floor.
    cap('thighN', plus(hip, v(1, 0)), v(20, 21.5), 2.6, 2.2, robe, 3),
    cap('shinN', v(20, 21.5), footN, 2, 1.6, robe, 3.05),
    // A bedroll tied across the back.
    cap('bedroll', plus(chest, v(-4.5, -0.5)), plus(chest, v(-3, 5)), 2.2, 2, R('kpqQr'), 1.9),
    // The hood, deep, the face in its shadow: a nose and a grey beard catch the lantern's light.
    cap('hood', plus(head, v(-1.4, -0.6)), plus(head, v(0.6, 0.2)), 3.6, 3.2, hood, 4),
    cap('face', plus(head, v(1.6, 0.8)), plus(head, v(2.1, 1.6)), 1.3, 1.1, face, 4.1),
    cap('beard', plus(head, v(1.6, 2.4)), plus(head, v(1.2, 4.2)), 1.1, 0.6, R('tTuUw'), 4.15),
    // The staff upright in the near hand, its top hooked; the arm reaching to it.
    cap('staff', v(23.5, 30), v(23, 3), 0.7, 0.6, staff, 5),
    cap('hook', v(23, 3), v(21.4, 1.6), 0.6, 0.5, staff, 5.01),
    cap('arm', plus(chest, v(1.5, 1)), v(22.6, 14 + breath), 1.5, 1.2, robe, 5.1),
    cap('hand', v(22.6, 14 + breath), v(23.4, 14.5 + breath), 1.1, 1, face, 5.2),
    // The lantern on the floor before the knee: an iron cage, the flame alive in it.
    poly('lantern', [v(25, 30), v(29, 30), v(28.6, 24.5), v(25.4, 24.5)], 0.3, iron, 6),
    cap('lanternTop', v(25.6, 24), v(28.4, 24), 0.6, 0.6, iron, 6.05),
    cap('flame', v(27, 28.6), v(27 + c * 0.3, 25.6 - s * 0.4), 1.4, 0.6, glow, 6.1),
    cap('flameCore', v(27, 28.4), v(27, 27.4), 0.6, 0.4, R('Bwwww'), 6.15),
  ];
  return stand(parts, [heel, footN, v(27, 30)], HERMIT_H - 1);
}

export const CANDLE_KEEPER_W = 28, CANDLE_KEEPER_H = 46;
/**
 * A candle-keeper: a nun in a dark grey habit, a pale wimple round her face under a rounded black veil, a three-branched
 * candlestick held before her; the flames move, the hem stirs.
 */
export function candleKeeper(t: number): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  const habit = R('kttTu'), veil = R('kkOsO'), wimple = R('tiIww'), face = R('pQrRw'), sash = R('xdDeE'), brass = R('kaAbB'), wax = R('iIwww'), flame = R('aAbBw'), eye = R('kkkkk');
  const sway = s * 0.4;
  const head = v(13.5, 8.5);
  const parts: Part[] = [
    // The veil falling behind to the waist, the habit to the floor (its hem stirring), a crimson cord at the waist.
    poly('veilBack', [v(7.5, 26), v(13, 27), v(13, 9), v(9, 6)], 1.2, veil, 0.8),
    poly('habit', [v(6 - sway, 45.6), v(21 + sway, 45.6), v(18.5, 22), v(16.5, 14), v(10, 14), v(8, 22)], 1.2, habit, 2),
    cap('hem', v(6.6 - sway, 45.6), v(20.4 + sway, 45.6), 0.9, 0.9, habit, 2.05),
    cap('cord', v(9.5, 25), v(17, 25.5), 0.6, 0.6, sash, 2.2),
    cap('cordTail', v(16, 25.5), v(16.5 + sway, 32), 0.5, 0.4, sash, 2.25),
    // The wimple framing the face, white at the throat; the veil over the crown, rounded.
    cap('wimple', plus(head, v(0, 1)), plus(head, v(0.4, 4.5)), 3.4, 3, wimple, 3),
    cap('face', plus(head, v(1, 0.6)), plus(head, v(1.3, 2.2)), 1.8, 1.6, face, 3.1),
    cap('eyeN', plus(head, v(2.2, 0.4)), plus(head, v(2.2, 0.4)), 0.4, 0.4, eye, 3.15),
    cap('veilTop', plus(head, v(-1.8, -1.2)), plus(head, v(0.8, -2.4)), 3.2, 2.4, veil, 3.2),
    // The hands before the chest round the candlestick's stem, the sleeves wide.
    cap('sleeve', v(15.5, 15.5), v(17.5, 22.5), 2, 1.8, habit, 4),
    cap('hands', v(16.8, 23.5), v(18.8, 23.5), 1.1, 1.1, face, 4.1),
    cap('stem', v(18, 28), v(18, 18), 0.5, 0.5, brass, 5),
    cap('arms', v(15, 19), v(21, 19), 0.5, 0.5, brass, 5.01),
    cap('cupL', v(15, 18.5), v(15, 18.5), 0.8, 0.8, brass, 5.02),
    cap('cupM', v(18, 17.5), v(18, 17.5), 0.8, 0.8, brass, 5.02),
    cap('cupR', v(21, 18.5), v(21, 18.5), 0.8, 0.8, brass, 5.02),
    cap('waxL', v(15, 18), v(15, 15.5), 0.6, 0.6, wax, 5.1),
    cap('waxM', v(18, 17), v(18, 13.5), 0.6, 0.6, wax, 5.1),
    cap('waxR', v(21, 18), v(21, 15.5), 0.6, 0.6, wax, 5.1),
    cap('flameL', v(15, 15), v(15 + c * 0.3, 13.2 - s * 0.3), 0.8, 0.3, flame, 5.2),
    cap('flameM', v(18, 13), v(18 - c * 0.3, 11 + s * 0.3), 0.8, 0.3, flame, 5.2),
    cap('flameR', v(21, 15), v(21 + s * 0.3, 13.2 - c * 0.3), 0.8, 0.3, flame, 5.2),
  ];
  return stand(parts, [v(6.6, 45.6), v(20.4, 45.6)], CANDLE_KEEPER_H - 1);
}

// ---------------------------------------------------------------- soul: a wisp (10 x 12)

export const SOUL_W = 10, SOUL_H = 12;
export function soul(t: number): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  return [
    cap('wisp', v(5, 8), v(5 + s * 1.2, 2.5 + c * 0.4), 2.8, 0.6, R('aAbBw'), 1),
    cap('core', v(5, 8), v(5, 6.5), 1.2, 0.8, R('Bwwww'), 2),
  ];
}

// ---------------------------------------------------------------- gate: an iron grate set in a floor (64 x 16)

export const GATE_W = 64, GATE_H = 16;
/** A grate over the dark of a shaft, flush with the floor: a riveted iron frame and eight uprights, the dark between them. */
export function gate(): Part[] {
  const iron = R('kktTT'), rivet = R('aaAbB'), dark = R('kkkkk');
  const parts: Part[] = [
    poly('dark', [v(2, 2), v(62, 2), v(62, 14), v(2, 14)], 0, dark, 0),
    cap('top', v(2.5, 2.5), v(61.5, 2.5), 2, 2, iron, 1),
    cap('bottom', v(2.5, 13), v(61.5, 13), 1.6, 1.6, iron, 1),
    cap('left', v(2.5, 2.5), v(2.5, 13), 2, 2, iron, 1.1),
    cap('right', v(61.5, 2.5), v(61.5, 13), 2, 2, iron, 1.1),
  ];
  for (let x = 9.5; x <= 55; x += 6.5) parts.push(cap(`bar${x}`, v(x, 3.5), v(x, 12.5), 1.2, 1.2, iron, 1.3));
  for (const [x, y] of [
    [2.5, 2.5],
    [61.5, 2.5],
  ] as const)
    parts.push(cap(`rivet${x}-${y}`, v(x, y), v(x, y), 1.2, 1.2, rivet, 2));
  return parts;
}

// ---------------------------------------------------------------- the recipes

const frames = (n: number, draw: (t: number) => Part[], w: number, h: number): string[][] => Array.from({ length: n }, (_, i) => bake(draw(i / n), w, h));

/**
 * The castle's cast as recipes: a ghoul that shambles and lurches, a hound that crouches, runs and leaps, a gargoyle
 * that wakes to spit, a sentinel behind its shield, a wraith that casts and fades, a bone archer and their shots, an
 * altar's flame, a soul's flicker and the grate of a shortcut. Baked once, when the art kit loads.
 */
export const CAST_RECIPES: Readonly<Record<string, Recipe>> = {
  ghoul: {
    anchor: 'feet',
    anims: {
      walk: frames(4, (t) => ghoul(t, 'walk'), GHOUL_W, GHOUL_H),
      run: frames(4, (t) => ghoul(t, 'lurch'), GHOUL_W, GHOUL_H),
      hurt: [bake(ghoul(0, 'hurt'), GHOUL_W, GHOUL_H)],
      claw: frames(5, (t) => ghoul(t, 'claw'), GHOUL_W, GHOUL_H),
    },
    // The rake and its follow-through: the claws raised over the skull before them are the wind-up.
    active: { claw: [2, 3] },
  },
  hound: {
    anchor: 'feet',
    anims: {
      idle: frames(2, (t) => hound(t, 'crouch'), HOUND_W, HOUND_H),
      run: frames(4, (t) => hound(t, 'run'), HOUND_W, HOUND_H),
      jump: [bake(hound(0, 'leap'), HOUND_W, HOUND_H)],
      hurt: [bake(hound(0, 'hurt'), HOUND_W, HOUND_H)],
      pounce: frames(5, (t) => hound(t, 'pounce'), HOUND_W, HOUND_H),
    },
    // Launched and in flight: the coil before is the wind-up.
    active: { pounce: [2, 3] },
  },
  gargoyle: {
    anchor: 'feet',
    anims: {
      idle: [bake(gargoyle(0, 'stone'), GARGOYLE_W, GARGOYLE_H)],
      aim: frames(2, (t) => gargoyle(t, 'aim'), GARGOYLE_W, GARGOYLE_H),
      hurt: [bake(gargoyle(0, 'hurt'), GARGOYLE_W, GARGOYLE_H)],
    },
    // The spit: its eyes and maw blaze over the wind-up before it.
    active: { aim: [1] },
  },
  sentinel: {
    anchor: 'feet',
    anims: {
      idle: frames(2, (t) => sentinel(t, 'guard'), SENTINEL_W, SENTINEL_H),
      walk: frames(4, (t) => sentinel(t, 'walk'), SENTINEL_W, SENTINEL_H),
      hurt: [bake(sentinel(0, 'hurt'), SENTINEL_W, SENTINEL_H)],
      block: [bake(sentinel(0, 'block'), SENTINEL_W, SENTINEL_H)],
      thrust: frames(5, (t) => sentinel(t, 'thrust'), SENTINEL_W, SENTINEL_H),
    },
    // Driven out and held: the spear drawn back over the shoulder before them is the wind-up.
    active: { thrust: [2, 3] },
  },
  // It floats: drawn about its middle, no shadow under it, the wisps hanging below its body.
  wraith: {
    anchor: 'center',
    noShadow: true,
    anims: {
      idle: frames(4, (t) => wraith(t, 'idle'), WRAITH_W, WRAITH_H),
      hurt: [bake(wraith(0, 'hurt'), WRAITH_W, WRAITH_H)],
      cast: frames(5, (t) => wraith(t, 'cast'), WRAITH_W, WRAITH_H),
      fade: frames(6, (t) => wraith(t, 'fade'), WRAITH_W, WRAITH_H),
    },
    // The hex pushed out; gone but for its eyes through the fade's middle.
    active: { cast: [2], fade: [3] },
  },
  'bone-archer': {
    anchor: 'feet',
    anims: {
      walk: frames(4, (t) => archer(t, 'walk'), ARCHER_W, ARCHER_H),
      hurt: [bake(archer(0, 'hurt'), ARCHER_W, ARCHER_H)],
      draw: frames(6, (t) => archer(t, 'draw'), ARCHER_W, ARCHER_H),
    },
    // Loosed: the nock, the bow raised and the long draw before it are the wind-up.
    active: { draw: [4] },
  },
  hex: { anchor: 'center', noShadow: true, anims: { run: frames(3, hex, 10, 10) } },
  // The boss: every clip a pose a frame. Its moves' blows: the chop's fall and bite, the leap's flight down, the drag's
  // sweep, the roar's height, the combo's sweep and chop; the rise's middle (no blow, but the move's middle).
  headsman: {
    anchor: 'feet',
    anims: Object.fromEntries(Object.entries(HEADSMAN_CLIPS).map(([name, poses]) => [name, poses.map((pose) => bake(headsman(pose), HEADSMAN_W, HEADSMAN_H))])),
    active: { rise: [2, 3], chop: [2, 3], leap: [2, 3], drag: [2], roar: [1], combo: [1, 2, 3, 4] },
  },
  wave: { anchor: 'center', noShadow: true, noOutline: false, anims: { run: frames(3, wave, WAVE_W, WAVE_H) } },
  // The bone archer's arrow: crimson fletching, a dark shaft, a steel head.
  shaft: { anchor: 'center', noShadow: true, anims: { run: [['.d..........U.', 'dDdqqqqqqqqqTw', '.d..........U.']] } },
  altar: { anchor: 'feet', anims: { idle: frames(3, altar, ALTAR_W, ALTAR_H) } },
  // The castle's people: they breathe, their flames move.
  hermit: { anchor: 'feet', anims: { idle: frames(3, hermit, HERMIT_W, HERMIT_H) } },
  'candle-keeper': { anchor: 'feet', anims: { idle: frames(3, candleKeeper, CANDLE_KEEPER_W, CANDLE_KEEPER_H) } },
  soul: { anchor: 'center', anims: { idle: frames(3, soul, SOUL_W, SOUL_H) } },
  gate: { anchor: 'center', noShadow: true, anims: { idle: [bake(gate(), GATE_W, GATE_H)] } },
};
