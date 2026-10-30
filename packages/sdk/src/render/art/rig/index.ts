import type { ArtPalette } from '../palette.js';
import type { PixelCanvas } from '../pixels.js';
import { v, type Vec } from './geometry.js';
import { KNIGHT_BODY, KNIGHT_CLIPS, knightFrames, knightMaterials, type Clip } from './knight.js';
import { rasterize, type Look, type Part } from './raster.js';

export { joints, mixPose, poseAt, type Body, type Joints, type Key, type Pose } from './body.js';
export { chain, smear, stepChain, strip, type Chain } from './cloth.js';
export { atan2Deg, polar, type Vec } from './geometry.js';
export { KNIGHT_BODY, KNIGHT_CLIPS, knightFrames, knightMaterials, knightParts, type Clip, type KnightMaterials } from './knight.js';
export { rasterize, type Look, type Part, type Raster, type Shape } from './raster.js';

/** A rigged character: its frame size, the foot point every frame stands on, its clips and how it draws a clip. */
export interface Rig {
  id: string;
  w: number;
  h: number;
  /** Where the feet touch the ground in every frame: the sprite's origin, centred so a flip mirrors about it. */
  anchor: Vec;
  /** The hitbox its body fills, centred on the anchor and standing on it. */
  body: { w: number; h: number };
  clips: readonly Clip[];
  frames(clip: Clip, pal: ArtPalette): Part[][];
}

const KNIGHT_ANCHOR = v(64, 80);

/** Every rig, by id. Like RECIPES for template sprites; the golden lock pins every frame. */
export const RIGS: Readonly<Record<string, Rig>> = {
  knight: { id: 'knight', w: 128, h: 81, anchor: KNIGHT_ANCHOR, body: { w: 14, h: 42 }, clips: KNIGHT_CLIPS, frames: (clip, pal) => knightFrames(KNIGHT_BODY, clip, knightMaterials(pal), KNIGHT_ANCHOR) },
};

/** How a rig is lit in a palette: a key light from above and in front, ink outlines, a faint back light on the upper body, the floor at its feet. */
export function rigLook(pal: ArtPalette, rig: Rig): Look {
  const l = Math.sqrt(0.35 * 0.35 + 0.8 * 0.8 + 0.55 * 0.55);
  return { light: [0.35 / l, -0.8 / l, 0.55 / l], bands: [-0.35, 0.05, 0.5, 0.84], dither: 0.16, outline: pal.outline, ink: pal.ink, contour: true, rim: { side: -1, above: rig.anchor.y - 16 }, floor: rig.anchor.y };
}

export interface RigFrame {
  clip: string;
  frame: number;
  color: PixelCanvas;
  normal: PixelCanvas;
  owner: Int16Array;
  parts: readonly Part[];
}

/** Every frame of every clip of a rig, painted in a palette. */
export function paintRig(rig: Rig, pal: ArtPalette, look: Look = rigLook(pal, rig)): RigFrame[] {
  return rig.clips.flatMap((clip) =>
    rig.frames(clip, pal).map((parts, frame) => {
      const r = rasterize(parts, rig.w, rig.h, look);
      return { clip: clip.name, frame, color: r.color, normal: r.normal, owner: r.owner, parts };
    }),
  );
}
