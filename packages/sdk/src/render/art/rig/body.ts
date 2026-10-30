import { ease, lerp, plus, polar, v, type Vec } from './geometry.js';

/** A biped's proportions in pixels: bone lengths and the radii of the capsules drawn over them. */
export interface Body {
  thigh: number;
  shin: number;
  foot: number;
  torso: number;
  neck: number;
  head: number;
  upper: number;
  fore: number;
  hip: number;
  chest: number;
  thighR: readonly [number, number];
  shinR: readonly [number, number];
  upperR: readonly [number, number];
  foreR: readonly [number, number];
  footR: number;
  handR: number;
  /** The held weapon's length, hilt to tip. */
  blade: number;
}

/**
 * A pose, facing east. Angles are degrees, 0 east and 90 south; an arm is [upper arm, elbow bend], a leg [thigh, knee
 * bend]. Keys hold unwrapped angles (past 360 where a swing goes over the top), so a blend runs the way the limb moves.
 */
export interface Pose {
  /** Shift forward of the pelvis, and lift off the ground. */
  dx: number;
  lift: number;
  lean: number;
  head: number;
  armN: readonly [number, number];
  armF: readonly [number, number];
  legN: readonly [number, number];
  legF: readonly [number, number];
  /** The weapon, relative to the near forearm. */
  blade: number;
}

export interface Joints {
  pelvis: Vec;
  chest: Vec;
  neck: Vec;
  headC: Vec;
  spine: number;
  shoulderN: Vec;
  shoulderF: Vec;
  elbowN: Vec;
  handN: Vec;
  foreN: number;
  elbowF: Vec;
  handF: Vec;
  hipN: Vec;
  kneeN: Vec;
  ankleN: Vec;
  toeN: Vec;
  hipF: Vec;
  kneeF: Vec;
  ankleF: Vec;
  toeF: Vec;
  bladeA: number;
  hilt: Vec;
  tip: Vec;
}

/** Where every joint is for a pose, standing on `foot` (the lowest foot touches it, so bent knees lower the body). */
export function joints(b: Body, p: Pose, foot: Vec): Joints {
  const leg = (thigh: number, bend: number, hipX: number) => {
    const hip = v(hipX, 0);
    const knee = plus(hip, polar(thigh, b.thigh));
    const shinA = thigh + bend;
    const ankle = plus(knee, polar(shinA, b.shin));
    const toe = plus(ankle, polar((shinA - 90) * 0.3, b.foot));
    return { hip, knee, ankle, toe };
  };
  const ln = leg(p.legN[0], p.legN[1], 1);
  const lf = leg(p.legF[0], p.legF[1], -1);
  const low = Math.max(ln.ankle.y, ln.toe.y, lf.ankle.y, lf.toe.y) + b.footR;
  const pelvis = v(foot.x + p.dx, foot.y - low - p.lift);
  const at = (q: Vec) => plus(pelvis, q);
  const spine = 270 + p.lean;
  const chest = plus(pelvis, polar(spine, b.torso));
  const neck = plus(chest, polar(spine + p.head * 0.5, b.neck));
  const headC = plus(neck, polar(spine + p.head, b.head * 0.9));
  const shoulder = plus(chest, polar(spine + 180, 1.6));
  const shoulderN = plus(shoulder, v(0.8, 0));
  const shoulderF = plus(shoulder, v(-1.6, 0));
  const elbowN = plus(shoulderN, polar(p.armN[0], b.upper));
  const foreN = p.armN[0] - p.armN[1];
  const handN = plus(elbowN, polar(foreN, b.fore));
  const elbowF = plus(shoulderF, polar(p.armF[0], b.upper));
  const handF = plus(elbowF, polar(p.armF[0] - p.armF[1], b.fore));
  const bladeA = foreN + p.blade;
  return {
    pelvis,
    chest,
    neck,
    headC,
    spine,
    shoulderN,
    shoulderF,
    elbowN,
    handN,
    foreN,
    elbowF,
    handF,
    hipN: at(ln.hip),
    kneeN: at(ln.knee),
    ankleN: at(ln.ankle),
    toeN: at(ln.toe),
    hipF: at(lf.hip),
    kneeF: at(lf.knee),
    ankleF: at(lf.ankle),
    toeF: at(lf.toe),
    bladeA,
    hilt: plus(handN, polar(bladeA, 1.2)),
    tip: plus(handN, polar(bladeA, 2.4 + b.blade)),
  };
}

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const m = (x: number, y: number) => lerp(x, y, t);
  const m2 = (x: readonly [number, number], y: readonly [number, number]): [number, number] => [m(x[0], y[0]), m(x[1], y[1])];
  return { dx: m(a.dx, b.dx), lift: m(a.lift, b.lift), lean: m(a.lean, b.lean), head: m(a.head, b.head), armN: m2(a.armN, b.armN), armF: m2(a.armF, b.armF), legN: m2(a.legN, b.legN), legF: m2(a.legF, b.legF), blade: m(a.blade, b.blade) };
}

/** A key of a clip: a pose at a fraction of the clip. */
export interface Key {
  at: number;
  pose: Pose;
}

/** The pose at a fraction of a clip, eased between its keys (and back to the first key when it loops). */
export function poseAt(keys: readonly Key[], t: number, loop: boolean): Pose {
  const ks = loop ? [...keys, { at: 1, pose: keys[0]!.pose }] : keys;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i]!;
    const b = ks[i + 1]!;
    if (t >= a.at && t <= b.at) return mixPose(a.pose, b.pose, ease(b.at > a.at ? (t - a.at) / (b.at - a.at) : 0));
  }
  return ks[ks.length - 1]!.pose;
}
