/** Colour maths for the art kit: hex parsing, HSL, mixing and hue-shifted shading (cool shadows, warm highlights). */

export type RGB = readonly [number, number, number];
/** Five shades of one colour, darkest first; index 2 is the colour itself. */
export type Ramp = readonly [RGB, RGB, RGB, RGB, RGB];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 0, 255];
}

export const toInt = (c: RGB): number => (c[0] << 16) | (c[1] << 8) | c[2];
export const toCss = (c: RGB, alpha = 1): string => (alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`);

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

/** Relative luminance (sRGB, 0..1). */
export function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Moves a hue part of the way toward another, the short way round the wheel. */
export function hueToward(from: number, target: number, t: number): number {
  const d = ((target - from + 540) % 360) - 180;
  return (from + d * t + 360) % 360;
}

/**
 * Darker (amount < 0) or lighter (amount > 0), the way pixel artists shade: shadows drift toward blue-violet and gain a
 * little saturation, highlights drift toward warm yellow and lose some. |amount| 1 is about as far as it goes.
 */
export function shade(c: RGB, amount: number): RGB {
  const [h, s, l] = rgbToHsl(c);
  if (amount < 0) {
    const t = Math.min(1, -amount);
    return hslToRgb(hueToward(h, 245, 0.22 * t), clamp01(s + 0.1 * t), clamp01(l * (1 - 0.6 * t)));
  }
  const t = Math.min(1, amount);
  const warm = hslToRgb(hueToward(h, 52, 0.16 * t), clamp01(s - 0.06 * t), clamp01(l + (1 - l) * 0.6 * t));
  // Saturated yellows already sit at the top of the luminance curve: warming or desaturating them would make the
  // highlight darker than the colour, so those are lifted straight toward white instead.
  return luminance(warm) >= luminance(c) ? warm : mix(c, [255, 255, 255], 0.6 * t);
}

export function ramp(c: RGB): Ramp {
  return [shade(c, -0.72), shade(c, -0.38), c, shade(c, 0.34), shade(c, 0.68)];
}
