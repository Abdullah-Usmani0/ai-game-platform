import { artPalette, paintRig, PixelCanvas, RIGS, type PaletteRoles, type RigFrame } from '@gg/sdk/art';
import { describe, expect, it } from 'vitest';
import { checkRig } from './rig-qa.js';

const PALETTES: Record<string, PaletteRoles> = {
  gothic: { background: '#120d0b', mid: '#4a3326', foreground: '#efe3cf', accent: '#c9a227', danger: '#b3122b', ui: '#efe3cf' },
  reef: { background: '#062a3a', mid: '#1f6f78', foreground: '#f4e9d8', accent: '#ff8c61', danger: '#e63946', ui: '#ffffff' },
};
const knight = RIGS['knight']!;
const codes = (frames: readonly RigFrame[], pal = artPalette(PALETTES['gothic']!, 'dark')) => checkRig(knight, frames, pal).issues.map((i) => i.code);

describe('rig art QA', () => {
  it('passes the knight in every palette and outline mode', () => {
    for (const roles of Object.values(PALETTES)) {
      for (const outline of ['dark', 'selective'] as const) {
        const pal = artPalette(roles, outline);
        const r = checkRig(knight, paintRig(knight, pal), pal);
        expect(r.issues, `${outline}`).toEqual([]);
      }
    }
  });

  it('fails a frame with a pixel off the palette, a lone speck, a missing outline or feet off the ground', () => {
    const pal = artPalette(PALETTES['gothic']!, 'dark');
    const painted = paintRig(knight, pal);
    // A copy of the painted frames to break.
    const fresh = (): RigFrame[] =>
      painted.map((f) => {
        const color = new PixelCanvas(f.color.w, f.color.h);
        color.data.set(f.color.data);
        return { ...f, color, owner: Int16Array.from(f.owner) };
      });
    const firstPart = (f: RigFrame) => f.owner.findIndex((o) => o >= 0);

    const offPalette = fresh();
    const i = firstPart(offPalette[0]!);
    offPalette[0]!.color.data.set([255, 0, 255], i * 4);
    expect(codes(offPalette, pal)).toContain('rig_palette');

    const speck = fresh();
    speck[0]!.color.set(2, 2, pal.ink);
    expect(codes(speck, pal)).toContain('rig_specks');

    const bare = fresh();
    const f = bare[0]!;
    for (let o = 0; o < f.owner.length; o++) if (f.owner[o]! < 0) f.color.clear(o % knight.w, Math.floor(o / knight.w));
    expect(codes(bare, pal)).toContain('rig_outline');

    const floating = fresh();
    const g = floating[1]!;
    // Lifted three rows off the ground.
    g.color.data.copyWithin(0, knight.w * 4 * 3);
    g.color.data.fill(0, g.color.data.length - knight.w * 4 * 3);
    g.owner.copyWithin(0, knight.w * 3);
    g.owner.fill(-1, g.owner.length - knight.w * 3);
    expect(codes(floating, pal)).toContain('rig_ground');
  });
});
