import { hslToRgb, hueToward, luminance, mix, parseHex, ramp, rgbToHsl, shade, type Ramp, type RGB } from './color.js';

export type OutlineMode = 'none' | 'dark' | 'colored' | 'selective';

export interface PaletteRoles {
  background: string;
  mid: string;
  foreground: string;
  accent: string;
  danger: string;
  ui: string;
}

/** Every colour the art kit draws with, derived from the style card's six palette roles. */
export interface ArtPalette {
  /** Outlines and the darkest darks. */
  ink: RGB;
  white: RGB;
  /** Sky gradient, top then horizon. */
  sky: readonly [RGB, RGB];
  /** Parallax silhouettes, farthest first. */
  far: RGB;
  near: RGB;
  terrain: Ramp;
  /** Growth: moss on rock, the grass of a field. A muted green nudged toward the accent, as light as the terrain allows. */
  rim: Ramp;
  /** Top-down floors. */
  floor: Ramp;
  hero: Ramp;
  /** The hero's clothes: opposite the danger hue, so the player never reads as an enemy. */
  garment: Ramp;
  accent: Ramp;
  danger: Ramp;
  ui: Ramp;
  /** Wood for crates and planks: warm, between the terrain and the accent. */
  wood: Ramp;
  outline: OutlineMode;
}

export function artPalette(roles: PaletteRoles, outline: OutlineMode = 'dark'): ArtPalette {
  const bg = parseHex(roles.background);
  const mid = parseHex(roles.mid);
  const accent = parseHex(roles.accent);
  const darkest = luminance(bg) < luminance(mid) ? bg : mid;
  const ink = shade(darkest, -0.78);
  const light = luminance(bg) > 0.45;
  const [dangerHue] = rgbToHsl(parseHex(roles.danger));
  const [, accentSat] = rgbToHsl(accent);
  const garment = hslToRgb(dangerHue + 175, Math.max(0.38, Math.min(0.62, accentSat * 0.7)), 0.5);
  const [accentHue] = rgbToHsl(accent);
  const [, midSat, midL] = rgbToHsl(mid);
  const foliage = hslToRgb(hueToward(108, accentHue, 0.18), Math.max(0.3, Math.min(0.5, 0.3 + midSat * 0.4)), Math.max(0.3, Math.min(0.48, midL + 0.1)));
  return {
    ink,
    white: mix(parseHex(roles.ui), [255, 255, 255], 0.5),
    sky: [bg, mix(bg, mid, light ? 0.25 : 0.42)],
    far: mix(bg, mid, 0.22),
    near: mix(bg, mid, 0.42),
    terrain: ramp(mid),
    rim: ramp(foliage),
    floor: ramp(mix(bg, mid, 0.66)),
    hero: ramp(parseHex(roles.foreground)),
    garment: ramp(garment),
    accent: ramp(accent),
    danger: ramp(parseHex(roles.danger)),
    ui: ramp(parseHex(roles.ui)),
    wood: ramp(mix(shade(accent, -0.45), mid, 0.35)),
    outline,
  };
}
