import { sinCosDeg } from '../../../sim/trig.js';
import { mix, ramp, type Ramp } from '../color.js';
import type { ArtPalette } from '../palette.js';
import { joints, poseAt, type Body, type Joints, type Key, type Pose } from './body.js';
import { chain, smear, stepChain, strip } from './cloth.js';
import { atan2Deg, dist, plus, polar, v, type Vec } from './geometry.js';
import type { Part } from './raster.js';

/** A plumed knight with a greatsword: the first rig, about 42 px from boot to helm. */
export const KNIGHT_BODY: Body = {
  thigh: 10,
  shin: 9.5,
  foot: 4,
  torso: 13,
  neck: 2,
  head: 4.4,
  upper: 8.5,
  fore: 8,
  hip: 4.6,
  chest: 5.6,
  thighR: [3.1, 2.4],
  shinR: [2.5, 1.9],
  upperR: [2.5, 2.0],
  foreR: [2.1, 1.8],
  footR: 1.7,
  handR: 1.9,
  blade: 21,
};

export interface KnightMaterials {
  steel: Ramp;
  cloth: Ramp;
  trim: Ramp;
  leather: Ramp;
  blade: Ramp;
  plume: Ramp;
  smear: Ramp;
}

/** The knight's materials from a game's palette: cool steel, the hero's garment colour, accent trim, wood-toned leather. */
export function knightMaterials(pal: ArtPalette): KnightMaterials {
  return {
    steel: ramp(mix(mix(pal.hero[2], pal.terrain[2], 0.5), [126, 130, 146], 0.4)),
    cloth: pal.garment,
    trim: pal.accent,
    leather: pal.wood,
    blade: ramp(mix(pal.hero[3], [200, 210, 220], 0.5)),
    plume: pal.hero,
    smear: ramp(mix(pal.white, pal.accent[4], 0.2)),
  };
}

/** A clip: poses keyed through it, the frames that hit, which way they swing, and the wind on the cloth. */
export interface Clip {
  name: string;
  frames: number;
  loop: boolean;
  keys: readonly Key[];
  /** Frames that hit: drawn with a smear (a swing) or a streak (a thrust). */
  active?: readonly number[];
  /** Which way the active frames swing: 1 clockwise, -1 counter-clockwise, 0 a thrust. */
  swing?: number;
  /** Wind on the cloth: the clip's own speed through the air (negative streams it back). */
  wind: number;
  /** Drawn in the air (a jump, a fall): the feet may leave the ground, never sink below it. */
  air?: boolean;
}

const IDLE_A: Pose = { dx: 0, lift: 0, lean: 3, head: -2, armN: [62, 40], armF: [100, 25], legN: [76, 24], legF: [104, 16], blade: -8 };
const IDLE_B: Pose = { ...IDLE_A, lean: 4, head: 0, armN: [65, 42], armF: [102, 27], legN: [74, 30], legF: [106, 21], blade: -6 };

function runPose(t: number): Pose {
  const [s, c] = sinCosDeg(t * 360);
  const bend = (cc: number) => 22 + 50 * Math.max(0, cc) * Math.max(0, cc);
  return { dx: 0, lift: 0, lean: 14, head: -10, legN: [88 - 40 * s, bend(c)], legF: [88 + 40 * s, bend(-c)], armN: [96 + 16 * s, 55], armF: [92 - 32 * s, 75], blade: 108 - 16 * s };
}

// Arm angles run past 360 where a swing goes over the top: a blend between keys runs the way the blade travels.
const STANCE: Pose = { dx: 0, lift: 0, lean: 8, head: -4, armN: [55, 25], armF: [95, 35], legN: [66, 30], legF: [110, 18], blade: 0 };
const A1_UP: Pose = { dx: -1, lift: 0, lean: -6, head: -2, armN: [245, 35], armF: [200, 40], legN: [72, 26], legF: [106, 20], blade: -25 };
const A1_HIT: Pose = { dx: 4, lift: 0, lean: 20, head: -8, armN: [385, 8], armF: [70, 30], legN: [55, 38], legF: [118, 14], blade: 12 };
const A1_END: Pose = { dx: 4, lift: 0, lean: 14, head: -6, armN: [420, 22], armF: [90, 35], legN: [58, 36], legF: [116, 16], blade: 18 };
const A2_LOW: Pose = { dx: 4, lift: 0, lean: 10, head: -4, armN: [475, 55], armF: [80, 40], legN: [60, 34], legF: [114, 18], blade: 95 };
const A2_HIT: Pose = { dx: 6, lift: 0, lean: -6, head: -12, armN: [305, 15], armF: [40, 60], legN: [64, 26], legF: [110, 20], blade: -10 };
const A2_END: Pose = { dx: 6, lift: 0, lean: 2, head: -6, armN: [318, 45], armF: [70, 50], legN: [64, 28], legF: [110, 20], blade: -20 };
const A3_BACK: Pose = { dx: 4, lift: 0, lean: 6, head: -2, armN: [510, 95], armF: [100, 60], legN: [58, 62], legF: [122, 44], blade: 115 };
const A3_HIT: Pose = { dx: 13, lift: 0, lean: 22, head: -14, armN: [368, 4], armF: [120, 30], legN: [42, 34], legF: [128, 8], blade: -4 };
const A3_END: Pose = { dx: 11, lift: 0, lean: 12, head: -6, armN: [400, 20], armF: [100, 35], legN: [52, 36], legF: [120, 14], blade: 8 };

const at = (frame: number, frames: number) => frame / (frames - 1);

// Off the ground and on the move: knees drawn up on the way up, legs reaching for the floor on the way down, a dash
// leant into with the blade trailing, a hit taken on the back foot.
const JUMP_A: Pose = { dx: 1, lift: 7, lean: 6, head: -8, armN: [28, 45], armF: [150, 35], legN: [52, 95], legF: [104, 70], blade: -40 };
const JUMP_B: Pose = { ...JUMP_A, lift: 8, head: -6, armN: [24, 42], armF: [156, 32], legN: [48, 100], legF: [100, 76] };
const FALL_A: Pose = { dx: 0, lift: 4, lean: 4, head: 8, armN: [38, 34], armF: [162, 30], legN: [76, 28], legF: [106, 40], blade: 55 };
const FALL_B: Pose = { ...FALL_A, armN: [34, 30], armF: [166, 27], legN: [74, 32], legF: [108, 36] };
const DASH_A: Pose = { dx: 5, lift: 0, lean: 30, head: -18, armN: [150, 25], armF: [55, 40], legN: [46, 30], legF: [132, 22], blade: 165 };
const DASH_B: Pose = { ...DASH_A, lean: 32, legN: [44, 34], legF: [136, 18] };
const HURT_A: Pose = { dx: -4, lift: 0, lean: -24, head: 20, armN: [160, 30], armF: [215, 25], legN: [68, 26], legF: [114, 30], blade: 20 };
const HURT_B: Pose = { ...HURT_A, lean: -20, head: 16, armN: [154, 34] };

export const KNIGHT_CLIPS: readonly Clip[] = [
  { name: 'idle', frames: 8, loop: true, keys: [{ at: 0, pose: IDLE_A }, { at: 0.5, pose: IDLE_B }], wind: 0 },
  { name: 'run', frames: 8, loop: true, keys: Array.from({ length: 8 }, (_, i) => ({ at: i / 8, pose: runPose(i / 8) })), wind: -0.55 },
  { name: 'attack1', frames: 9, loop: false, active: [3, 4], swing: 1, wind: 0, keys: [{ at: 0, pose: STANCE }, { at: at(2, 9), pose: A1_UP }, { at: at(4, 9), pose: A1_HIT }, { at: at(8, 9), pose: A1_END }] },
  { name: 'attack2', frames: 8, loop: false, active: [2, 3], swing: -1, wind: 0, keys: [{ at: 0, pose: A1_END }, { at: at(1, 8), pose: A2_LOW }, { at: at(3, 8), pose: A2_HIT }, { at: at(7, 8), pose: A2_END }] },
  { name: 'attack3', frames: 11, loop: false, active: [4, 5], swing: 0, wind: 0, keys: [{ at: 0, pose: A2_END }, { at: at(3, 11), pose: A3_BACK }, { at: at(5, 11), pose: A3_HIT }, { at: at(10, 11), pose: A3_END }] },
  { name: 'jump', frames: 2, loop: true, air: true, wind: -0.3, keys: [{ at: 0, pose: JUMP_A }, { at: 0.5, pose: JUMP_B }] },
  { name: 'fall', frames: 2, loop: true, air: true, wind: -0.25, keys: [{ at: 0, pose: FALL_A }, { at: 0.5, pose: FALL_B }] },
  { name: 'dash', frames: 2, loop: true, wind: -1.1, keys: [{ at: 0, pose: DASH_A }, { at: 0.5, pose: DASH_B }] },
  { name: 'hurt', frames: 2, loop: true, wind: 0.35, keys: [{ at: 0, pose: HURT_A }, { at: 0.5, pose: HURT_B }] },
];

/** The knight's parts in one frame, back to front: cape, far limbs, body and tabard, near leg, helm and plume, near arm and sword. */
export function knightParts(b: Body, J: Joints, m: KnightMaterials, cape: readonly Vec[], plume: readonly Vec[], arc: readonly Vec[] | null): Part[] {
  const parts: Part[] = [];
  const cap = (id: string, a: Vec, c: Vec, ra: number, rb: number, mat: Ramp, depth: number, bias = 0, mark?: Part['mark'], layer?: Part['layer']) =>
    parts.push({ id, shape: { kind: 'capsule', a, b: c, ra, rb }, mat, depth, bias, ...(mark ? { mark } : {}), ...(layer ? { layer } : {}) });
  parts.push({ id: 'cape', shape: { kind: 'poly', pts: strip(cape, 4, 9, 3), round: 2.5 }, mat: m.cloth, depth: 0, bias: -1, layer: 'cloth' });
  cap('upperF', J.shoulderF, J.elbowF, b.upperR[0], b.upperR[1], m.steel, 1, -1);
  cap('foreF', J.elbowF, J.handF, b.foreR[0], b.foreR[1], m.steel, 1.01, -1);
  cap('handF', J.handF, J.handF, b.handR, b.handR, m.leather, 1.02, -1);
  cap('thighF', J.hipF, J.kneeF, b.thighR[0], b.thighR[1], m.leather, 1.5, -1);
  cap('shinF', J.kneeF, J.ankleF, b.shinR[0], b.shinR[1], m.steel, 1.51, -1);
  cap('footF', J.ankleF, J.toeF, b.footR, b.footR * 0.8, m.leather, 1.52, -1);
  cap('torso', J.pelvis, J.chest, b.hip, b.chest, m.steel, 3);
  const tabard: Vec[] = [
    plus(J.chest, v(-2.5, 2.5)),
    plus(J.chest, v(3.5, 2.5)),
    plus(J.pelvis, v(4.6, 0.5)),
    plus(J.hipN, polar(atan2Deg(J.kneeN.y - J.hipN.y, J.kneeN.x - J.hipN.x), 7.5)),
    plus(J.hipF, polar(atan2Deg(J.kneeF.y - J.hipF.y, J.kneeF.x - J.hipF.x), 6.5)),
    plus(J.pelvis, v(-4.6, 0.5)),
  ];
  parts.push({ id: 'tabard', shape: { kind: 'poly', pts: tabard, round: 2 }, mat: m.cloth, depth: 3.5 });
  cap('trim', tabard[3]!, tabard[4]!, 0.9, 0.9, m.trim, 3.55);
  cap('belt', plus(J.pelvis, v(-4.4, -1)), plus(J.pelvis, v(4.4, -1)), 1.1, 1.1, m.leather, 3.6);
  cap('buckle', plus(J.pelvis, v(3.4, -1)), plus(J.pelvis, v(3.4, -1)), 1, 1, m.trim, 3.61);
  cap('thighN', J.hipN, J.kneeN, b.thighR[0], b.thighR[1], m.leather, 3.2);
  cap('shinN', J.kneeN, J.ankleN, b.shinR[0], b.shinR[1], m.steel, 4);
  cap('kneeN', J.kneeN, J.kneeN, 1.9, 1.9, m.steel, 4.05);
  cap('footN', J.ankleN, J.toeN, b.footR, b.footR * 0.8, m.leather, 4.02);
  for (let i = 0; i < plume.length - 1; i++) cap(`plume${i}`, plume[i]!, plume[i + 1]!, 1.9 - i * 0.2, 1.7 - i * 0.2, m.plume, 4.9, 0, undefined, 'cloth');
  const slitY = Math.floor(J.headC.y + 0.3);
  cap('crest', plus(J.headC, polar(J.spine, b.head * 0.95)), plus(J.headC, plus(polar(J.spine, b.head * 0.7), v(-3, 0))), 1.1, 0.9, m.trim, 5.05);
  cap('helm', plus(J.headC, polar(J.spine + 180, 1.2)), plus(J.headC, polar(J.spine, 1.4)), b.head, b.head * 0.92, m.steel, 5, 0, (x, y) =>
    (y === slitY && x + 0.5 > J.headC.x - 0.5) || (y === slitY + 2 && x + 0.5 > J.headC.x + 1.5 && (x & 1) === 0) ? 0 : null,
  );
  cap('gorget', J.neck, plus(J.neck, polar(J.spine + 180, 1.5)), 2.6, 2.8, m.steel, 4.95, -1);
  cap('upperN', J.shoulderN, J.elbowN, b.upperR[0], b.upperR[1], m.steel, 6);
  cap('pauldron', J.shoulderN, plus(J.shoulderN, polar(J.spine + 180, 1)), 3.2, 3, m.steel, 6.5);
  cap('foreN', J.elbowN, J.handN, b.foreR[0], b.foreR[1], m.steel, 6.1);
  if (arc) {
    // Brightest along the blade's outer edge, dimmer toward the pivot.
    const r = dist(J.tip, J.shoulderN);
    const mark = (x: number, y: number) => {
      const d = dist(v(x + 0.5, y + 0.5), J.shoulderN);
      return d > r - 1.6 ? 4 : d > r - 4.5 ? 3 : 2;
    };
    parts.push({ id: 'smear', shape: { kind: 'poly', pts: arc, round: 0 }, mat: m.smear, depth: 6.8, mark, layer: 'effect' });
  }
  const back = plus(J.handN, polar(J.bladeA + 180, 3));
  cap('grip', J.handN, back, 0.8, 0.8, m.leather, 6.9, 0, undefined, 'gear');
  cap('pommel', back, back, 1.2, 1.2, m.trim, 6.91, 0, undefined, 'gear');
  cap('blade', J.hilt, J.tip, 1.1, 0.5, m.blade, 7, 0, undefined, 'gear');
  cap('guard', plus(J.hilt, polar(J.bladeA + 90, 3.2)), plus(J.hilt, polar(J.bladeA - 90, 3.2)), 0.8, 0.8, m.trim, 7.1, 0, undefined, 'gear');
  cap('handN', J.handN, J.handN, b.handR, b.handR, m.leather, 7.2);
  return parts;
}

/** The parts of every frame of a clip; the cloth runs through three loops first, so a looping clip loops seamlessly. */
export function knightFrames(b: Body, clip: Clip, m: KnightMaterials, foot: Vec): Part[][] {
  const J = Array.from({ length: clip.frames }, (_, f) => joints(b, poseAt(clip.keys, clip.loop ? f / clip.frames : f / (clip.frames - 1), clip.loop), foot));
  const capeAnchor = (j: Joints) => plus(j.chest, plus(polar(j.spine + 180, 1.5), v(-3.2, 0)));
  const plumeAnchor = (j: Joints) => plus(j.headC, plus(polar(j.spine, b.head * 0.8), v(-1.2, 0)));
  const cape = chain(capeAnchor(J[0]!), 8, 3.2);
  const plume = chain(plumeAnchor(J[0]!), 7, 2.3, 160);
  const capes: Vec[][] = [];
  const plumes: Vec[][] = [];
  const passes = clip.loop ? 3 : 1;
  const SUB = 4;
  for (let pass = 0; pass < passes; pass++) {
    for (let f = 0; f < clip.frames; f++) {
      const a = J[f]!;
      const nb = J[clip.loop ? (f + 1) % clip.frames : Math.min(f + 1, clip.frames - 1)]!;
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB;
        const ca = capeAnchor(a);
        const cb = capeAnchor(nb);
        const pa = plumeAnchor(a);
        const pb = plumeAnchor(nb);
        stepChain(cape, v(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t), clip.wind, 0.32, 0.9, a.pelvis.x - 1.5);
        stepChain(plume, v(pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t), clip.wind - 0.04, 0.14, 0.86, Infinity);
      }
      if (pass === passes - 1) {
        capes.push(cape.pts.map((p) => ({ ...p })));
        plumes.push(plume.pts.map((p) => ({ ...p })));
      }
    }
  }
  return J.map((j, f) => {
    let arc: Vec[] | null = null;
    if (clip.active?.includes(f) && f > 0) {
      const prev = J[f - 1]!;
      if (clip.swing) {
        const from = atan2Deg(prev.tip.y - j.shoulderN.y, prev.tip.x - j.shoulderN.x);
        let to = atan2Deg(j.tip.y - j.shoulderN.y, j.tip.x - j.shoulderN.x);
        if (clip.swing > 0) while (to < from) to += 360;
        else while (to > from) to -= 360;
        // A smear covers one frame's travel, never more than a wide half turn.
        to = from + Math.max(-160, Math.min(160, to - from));
        arc = smear(j.shoulderN, from, to, dist(j.tip, j.shoulderN), 9);
      } else {
        // A thrust leaves a streak behind the point instead.
        const tail = plus(j.tip, polar(j.bladeA + 180, 14));
        arc = [plus(j.tip, polar(j.bladeA + 90, 1.4)), plus(tail, polar(j.bladeA + 90, 0.5)), plus(tail, polar(j.bladeA - 90, 0.5)), plus(j.tip, polar(j.bladeA - 90, 1.4))];
      }
    }
    return knightParts(b, j, m, capes[f]!, plumes[f]!, arc);
  });
}
