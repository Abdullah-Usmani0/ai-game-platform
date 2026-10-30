import type { ArtPalette, Rig, RigFrame } from '@gg/sdk/art';
import { err, report, type Issue, type ValidationReport } from './report.js';

/** What the art QA measured over a rig's frames. */
export interface RigMeasure {
  frames: number;
  /** Pixels of a part not in its ramp, and outline pixels not ink where the outline is ink. */
  offPalette: number;
  /** Pixels on the silhouette's edge that are not outline. */
  unoutlined: number;
  /** Opaque pixels with no opaque neighbour. */
  specks: number;
  /** Outline corners where a 2x2 block holds three outline pixels: a line that steps twice. */
  jaggies: number;
  outlinePixels: number;
  /** Frames whose lowest row is not the anchor's. */
  offGround: number;
  /** How far the body box's top sits from the top of the drawn body in idle and run frames, as a share of its height (worst frame). */
  bodyGap: number;
  /** The largest change in drawn area (effects aside) between two frames in a row, as a share: a pop. */
  maxPop: number;
}

const same = (d: Uint8ClampedArray, i: number, c: readonly number[]) => d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2];

export function measureRig(rig: Rig, frames: readonly RigFrame[], pal: ArtPalette): RigMeasure {
  const m: RigMeasure = { frames: frames.length, offPalette: 0, unoutlined: 0, specks: 0, jaggies: 0, outlinePixels: 0, offGround: 0, bodyGap: 0, maxPop: 0 };
  const { w, h } = rig;
  let prevArea = -1;
  let prevClip = '';
  for (const f of frames) {
    const d = f.color.data;
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3]! > 0;
    const isOutline = (x: number, y: number) => opaque(x, y) && f.owner[y * w + x]! < 0;
    let area = 0;
    let lowest = -1;
    let bodyTop = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!opaque(x, y)) continue;
        lowest = y;
        const i = (y * w + x) * 4;
        const own = f.owner[y * w + x]!;
        if (own >= 0) {
          const part = f.parts[own]!;
          if (part.layer !== 'effect') area++;
          if ((part.layer ?? 'body') === 'body' && bodyTop < 0) bodyTop = y;
          if (!part.mat.some((c) => same(d, i, c))) m.offPalette++;
          if (pal.outline !== 'none' && (!opaque(x + 1, y) || !opaque(x - 1, y) || !opaque(x, y + 1) || !opaque(x, y - 1))) m.unoutlined++;
        } else {
          m.outlinePixels++;
          if (pal.outline === 'dark' && !same(d, i, pal.ink)) m.offPalette++;
          if (isOutline(x + 1, y) && isOutline(x, y + 1) && isOutline(x + 1, y + 1)) m.jaggies++;
        }
        let neighbours = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opaque(x + dx, y + dy)) neighbours++;
        if (neighbours === 0) m.specks++;
      }
    }
    if (lowest !== rig.anchor.y) m.offGround++;
    if ((f.clip === 'idle' || f.clip === 'run') && bodyTop >= 0) m.bodyGap = Math.max(m.bodyGap, Math.abs(bodyTop - (rig.anchor.y - rig.body.h)) / rig.body.h);
    if (f.clip === prevClip && prevArea > 0) m.maxPop = Math.max(m.maxPop, Math.abs(area - prevArea) / prevArea);
    prevArea = area;
    prevClip = f.clip;
  }
  return m;
}

/** The limits a rig is held to. */
export const RIG_LIMITS = { jaggyShare: 0.12, bodyGap: 0.12, maxPop: 0.3 } as const;

/**
 * Art QA for a rig: every pixel on its palette, the silhouette outlined all round, no specks, few jaggies, every frame
 * standing on its anchor, a body box as tall as the body drawn, and no pops between frames.
 */
export function checkRig(rig: Rig, frames: readonly RigFrame[], pal: ArtPalette): ValidationReport {
  const m = measureRig(rig, frames, pal);
  const issues: Issue[] = [];
  if (m.offPalette) issues.push(err('rig_palette', `${rig.id}: ${m.offPalette} pixel(s) off its palette`));
  if (m.unoutlined) issues.push(err('rig_outline', `${rig.id}: ${m.unoutlined} edge pixel(s) without an outline`));
  if (m.specks) issues.push(err('rig_specks', `${rig.id}: ${m.specks} lone pixel(s)`));
  if (m.outlinePixels && m.jaggies / m.outlinePixels > RIG_LIMITS.jaggyShare)
    issues.push(err('rig_jaggies', `${rig.id}: ${m.jaggies} doubled outline corner(s), ${Math.round((m.jaggies / m.outlinePixels) * 100)}% of the outline (at most ${RIG_LIMITS.jaggyShare * 100}%)`));
  if (m.offGround) issues.push(err('rig_ground', `${rig.id}: ${m.offGround} frame(s) not standing on the anchor's row`));
  if (m.bodyGap > RIG_LIMITS.bodyGap) issues.push(err('rig_body', `${rig.id}: its body box's top is ${Math.round(m.bodyGap * 100)}% of its height from the drawn body's top`));
  if (m.maxPop > RIG_LIMITS.maxPop) issues.push(err('rig_pop', `${rig.id}: its silhouette changes by up to ${Math.round(m.maxPop * 100)}% between two frames`));
  return report(issues, { ...m });
}
