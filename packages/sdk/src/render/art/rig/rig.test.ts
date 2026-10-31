import { describe, expect, it } from 'vitest';
import { artPalette, type PaletteRoles } from '../palette.js';
import { atan2Deg, paintRig, polar, RIGS } from './index.js';

const ROLES: PaletteRoles = { background: '#120d0b', mid: '#4a3326', foreground: '#efe3cf', accent: '#c9a227', danger: '#b3122b', ui: '#efe3cf' };
const pal = artPalette(ROLES, 'dark');
const knight = RIGS['knight']!;

describe('rigs', () => {
  it('paint the same pixels every time', () => {
    const a = paintRig(knight, pal);
    const b = paintRig(knight, pal);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(Buffer.from(a[i]!.color.data).equals(Buffer.from(b[i]!.color.data)), `${a[i]!.clip} ${a[i]!.frame}`).toBe(true);
      expect(Buffer.from(a[i]!.normal.data).equals(Buffer.from(b[i]!.normal.data))).toBe(true);
    }
    // Every frame painted twice: room for a busy machine.
  }, 60_000);

  it('draw every clip at its frame count, with a smear on the frames that hit and nowhere else', () => {
    const frames = paintRig(knight, pal);
    for (const clip of knight.clips) {
      const own = frames.filter((f) => f.clip === clip.name);
      expect(own.length, clip.name).toBe(clip.frames);
      for (const f of own) expect(f.parts.some((p) => p.id === 'smear'), `${clip.name} ${f.frame}`).toBe((clip.active ?? []).includes(f.frame) && f.frame > 0);
    }
    // idle 8, run 8, the chain 9 + 8 + 11, jump, fall, dash and hurt 2 each, the air cut 7 and the plunge 4.
    expect(frames.length).toBe(63);
  }, 60_000);

  it('write a normal map that faces the viewer where the colour is opaque', () => {
    const f = paintRig(knight, pal)[0]!;
    let inside = 0;
    for (let i = 0; i < f.owner.length; i++) {
      if (f.owner[i]! < 0) continue;
      inside++;
      expect(f.normal.data[i * 4 + 2]!).toBeGreaterThanOrEqual(128);
      expect(f.normal.data[i * 4 + 3]).toBe(255);
    }
    expect(inside).toBeGreaterThan(300);
  });

  it('measure angles the same as Math.atan2, to a fiftieth of a degree', () => {
    for (let deg = -179; deg <= 180; deg += 7) {
      const p = polar(deg, 10);
      expect(Math.abs(atan2Deg(p.y, p.x) - (Math.atan2(p.y, p.x) * 180) / Math.PI)).toBeLessThan(0.02);
    }
  });
});
