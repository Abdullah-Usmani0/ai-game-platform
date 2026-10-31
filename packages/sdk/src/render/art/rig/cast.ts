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

// ---------------------------------------------------------------- ghoul: a gaunt, hunched shambler (26 x 32)

export const GHOUL_W = 26, GHOUL_H = 32;
export function ghoul(t: number, mode: 'walk' | 'lurch' | 'hurt'): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  // Dried-blood flesh, dark-weighted; a pale skull face; rags; bone claws; one ember eye.
  const flesh = R('xxdDe'), skull = R('33445'), rags = R('ppqQQ'), claw = R('33445'), eyeR = R('EEEEE');
  const lurch = mode === 'lurch';
  const hurt = mode === 'hurt';
  const lean = hurt ? -20 : lurch ? 14 : 4;
  const swing = lurch ? 28 : 16;
  const pelvis = v(10, 18 - Math.abs(c) * (lurch ? 1 : 0.6));
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
  const nl = leg(s, 1), fl = leg(-s, -1);
  const arm = (phase: number, side: number) => {
    const sh = plus(chest, v(side * 0.8, 1.2));
    const a = hurt ? 160 : lurch ? 12 + 12 * phase : 70 - 16 * phase;
    const el = plus(sh, polar(a, 6));
    const hand = plus(el, polar(a + (lurch ? 6 : 16), 6));
    return { sh, el, hand, tip: plus(hand, polar(a + (lurch ? 30 : 50), 2.2)) };
  };
  const na = arm(-s, 1), fa = arm(s, -1);
  const eyeAt = plus(head, polar(-25 + lean * 0.4, 1.3));
  const parts = [
    cap('upperF', fa.sh, fa.el, 1.2, 1, flesh, 1, -1), cap('foreF', fa.el, fa.hand, 1, 0.8, flesh, 1.01, -1), cap('clawF', fa.hand, fa.tip, 0.7, 0.35, claw, 1.02, -1),
    cap('thighF', fl.hip, fl.knee, 1.4, 1.1, flesh, 1.5, -1), cap('shinF', fl.knee, fl.ankle, 1.1, 0.9, flesh, 1.51, -1), cap('footF', fl.ankle, fl.toe, 0.9, 0.7, flesh, 1.52, -1),
    cap('torso', pelvis, chest, 2.6, 3.4, flesh, 3), cap('hump', chest, hump, 2.6, 2, flesh, 3.05),
    poly('rags', [plus(pelvis, v(-3, -1.5)), plus(pelvis, v(3, -1)), plus(pelvis, v(3.5, 3.5)), plus(pelvis, v(1.5, 5.5)), plus(pelvis, v(-0.5, 4)), plus(pelvis, v(-2, 6)), plus(pelvis, v(-3.5, 3))], 0.6, rags, 3.2),
    cap('neck', chest, neck, 1.6, 1.3, flesh, 3.5), cap('skull', neck, head, 1.7, 2.1, skull, 4), cap('maw', head, plus(head, polar(55 + lean * 0.4, 1.6)), 1.1, 0.8, skull, 4.05, -2),
    cap('eye', eyeAt, eyeAt, 0.55, 0.55, eyeR, 4.2),
    cap('thighN', nl.hip, nl.knee, 1.5, 1.2, flesh, 5), cap('shinN', nl.knee, nl.ankle, 1.2, 0.95, flesh, 5.01), cap('footN', nl.ankle, nl.toe, 0.95, 0.7, flesh, 5.02),
    cap('upperN', na.sh, na.el, 1.3, 1.05, flesh, 6), cap('foreN', na.el, na.hand, 1.05, 0.85, flesh, 6.01), cap('clawN', na.hand, na.tip, 0.75, 0.35, claw, 6.02),
  ];
  return stand(parts, [nl.ankle, fl.ankle, nl.toe, fl.toe], GHOUL_H - 1);
}

// ---------------------------------------------------------------- hound: a lean crypt hound (30 x 20)

export const HOUND_W = 30, HOUND_H = 20;
export function hound(t: number, mode: 'crouch' | 'run' | 'leap' | 'hurt'): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  const fur = R('kxxdD'), belly = R('kkxxd'), eyeR = R('EEEEE'), fang = R('33445');
  const crouch = mode === 'crouch', leap = mode === 'leap', hurt = mode === 'hurt';
  const low = crouch ? 2 + c * 0.4 : 0;
  const pitch = leap ? -10 : hurt ? 8 : mode === 'run' ? s * 4 : 0;
  const hip = v(9, 11 + low);
  const shoulder = plus(hip, polar(-4 + pitch, 10));
  const neck = plus(shoulder, polar(crouch ? -10 : -38, 4));
  const head = plus(neck, polar(crouch ? 10 : 0, 2.2));
  const snout = plus(head, polar(crouch ? 22 : 14, 3.6));
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

// ---------------------------------------------------------------- soul: a wisp (10 x 12)

export const SOUL_W = 10, SOUL_H = 12;
export function soul(t: number): Part[] {
  const [s, c] = sinCosDeg(t * 360);
  return [
    cap('wisp', v(5, 8), v(5 + s * 1.2, 2.5 + c * 0.4), 2.8, 0.6, R('aAbBw'), 1),
    cap('core', v(5, 8), v(5, 6.5), 1.2, 0.8, R('Bwwww'), 2),
  ];
}

// ---------------------------------------------------------------- the recipes

const frames = (n: number, draw: (t: number) => Part[], w: number, h: number): string[][] => Array.from({ length: n }, (_, i) => bake(draw(i / n), w, h));

/**
 * The castle's cast as recipes: a ghoul that shambles and lurches, a hound that crouches, runs and leaps, a gargoyle
 * that wakes to spit, an altar's flame and a soul's flicker. Baked once, when the art kit loads.
 */
export const CAST_RECIPES: Readonly<Record<string, Recipe>> = {
  ghoul: {
    anchor: 'feet',
    anims: {
      walk: frames(4, (t) => ghoul(t, 'walk'), GHOUL_W, GHOUL_H),
      run: frames(4, (t) => ghoul(t, 'lurch'), GHOUL_W, GHOUL_H),
      hurt: [bake(ghoul(0, 'hurt'), GHOUL_W, GHOUL_H)],
    },
  },
  hound: {
    anchor: 'feet',
    anims: {
      idle: frames(2, (t) => hound(t, 'crouch'), HOUND_W, HOUND_H),
      run: frames(4, (t) => hound(t, 'run'), HOUND_W, HOUND_H),
      jump: [bake(hound(0, 'leap'), HOUND_W, HOUND_H)],
      hurt: [bake(hound(0, 'hurt'), HOUND_W, HOUND_H)],
    },
  },
  gargoyle: {
    anchor: 'feet',
    anims: {
      idle: [bake(gargoyle(0, 'stone'), GARGOYLE_W, GARGOYLE_H)],
      aim: frames(2, (t) => gargoyle(t, 'aim'), GARGOYLE_W, GARGOYLE_H),
      hurt: [bake(gargoyle(0, 'hurt'), GARGOYLE_W, GARGOYLE_H)],
    },
  },
  altar: { anchor: 'feet', anims: { idle: frames(3, altar, ALTAR_W, ALTAR_H) } },
  soul: { anchor: 'center', anims: { idle: frames(3, soul, SOUL_W, SOUL_H) } },
};
