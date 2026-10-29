import { luminance, mix, shade, type RGB } from './color.js';
import type { ArtPalette } from './palette.js';
import { hash2, PixelCanvas } from './pixels.js';
import type { Recipe } from './sprites.js';

/** Skies, parallax ridges, starfields, decorations and the effect textures (glow, shadow, sparks, vignette). */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** A vertical gradient in a few bands with ordered dithering between them; stars when the sky is dark. */
export function paintSky(pal: ArtPalette, w: number, h: number, bands = 5): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const [top, bottom] = pal.sky;
  const colors = Array.from({ length: bands }, (_, i) => mix(top, bottom, i / (bands - 1)));
  for (let y = 0; y < h; y++) {
    const t = (y / (h - 1)) * (bands - 1);
    const i = Math.min(bands - 2, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < w; x++) pc.set(x, y, f * 16 > BAYER4[(y % 4) * 4 + (x % 4)]! ? colors[i + 1]! : colors[i]!);
  }
  if (luminance(top) < 0.12) {
    for (let y = 0; y < h * 0.65; y++) {
      for (let x = 0; x < w; x++) {
        const s = hash2(x, y, 23);
        if (s > 0.9965) pc.set(x, y, pal.white);
        else if (s > 0.993) pc.set(x, y, mix(top, pal.white, 0.45));
      }
    }
  }
  return pc;
}

/** A seamless horizontal ridge (mountains, hills, tree lines) as a silhouette with a lit crest. */
export function paintRidge(w: number, h: number, color: RGB, opts: { seed: number; base: number; height: number; jag: number }): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const crest = shade(color, 0.22);
  // A sum of sines with whole periods over the width tiles seamlessly.
  const waves = [1, 2, 3, 5, 8].map((k, i) => ({ k, amp: 1 / (i + 1) ** (1.1 - opts.jag * 0.5), phase: hash2(k, opts.seed, 29) * Math.PI * 2 }));
  const norm = waves.reduce((n, wv) => n + wv.amp, 0);
  for (let x = 0; x < w; x++) {
    const v = waves.reduce((n, wv) => n + wv.amp * Math.sin((x / w) * Math.PI * 2 * wv.k + wv.phase), 0) / norm;
    const top = Math.round(h * opts.base - (v * 0.5 + 0.5) * h * opts.height);
    for (let y = Math.max(0, top); y < h; y++) pc.set(x, y, y === top ? crest : color);
  }
  return pc;
}

/** Flat-bottomed cumulus that tiles horizontally: lit on top, shaded underneath; dim and moonlit when the sky is dark. */
export function paintClouds(pal: ArtPalette, w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const night = luminance(pal.sky[0]) < 0.12;
  const body = mix(pal.sky[1], pal.white, night ? 0.13 : 0.55);
  const lit = mix(pal.sky[1], pal.white, night ? 0.27 : 0.82);
  const under = night ? mix(pal.sky[1], pal.sky[0], 0.2) : mix(pal.sky[1], pal.white, 0.32);
  for (let c = 0; c < 5; c++) {
    const cx = Math.floor(hash2(c, seed, 31) * w);
    const base = Math.floor(h * (0.16 + hash2(c, seed, 37) * 0.32));
    const len = 18 + Math.floor(hash2(c, seed, 41) * 30);
    const puffs = 3 + Math.floor(hash2(c, seed, 47) * 3);
    for (let b = 0; b < puffs; b++) {
      const t = (b + 0.5) / puffs;
      const r = Math.round((3 + hash2(c * 7 + b, seed, 43) * 4) * (1 - Math.abs(t - 0.5) * 0.8) + 2);
      const bx = cx + Math.round((t - 0.5) * len);
      const by = base - Math.round(r * 0.55);
      for (let y = -r; y <= r; y++) {
        if (by + y > base) continue;
        for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) pc.set((((bx + x) % w) + w) % w, by + y, body);
      }
    }
  }
  // Shade by shape: a lit crest where open sky is just above, a darker belly along the flat bottom.
  const shaded = new PixelCanvas(w, h);
  shaded.data.set(pc.data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pc.alpha(x, y) === 0) continue;
      const up = pc.alpha(x, y - 1) === 0 || pc.alpha(x, y - 2) === 0;
      const down = pc.alpha(x, y + 1) === 0 || pc.alpha(x, y + 2) === 0;
      if (up) shaded.set(x, y, lit);
      else if (down) shaded.set(x, y, under);
    }
  }
  return shaded;
}

/** The moon on a dark sky, the sun on a light one: a disc with a soft halo (and a few craters on the moon). */
export function paintSkyOrb(pal: ArtPalette, r: number): PixelCanvas {
  const night = luminance(pal.sky[0]) < 0.12;
  const size = r * 4;
  const pc = new PixelCanvas(size, size);
  const c0 = size / 2;
  const disc = night ? mix(pal.white, pal.ui[3], 0.25) : mix(pal.white, pal.accent[4], 0.45);
  const shadow = night ? mix(disc, pal.sky[0], 0.35) : mix(disc, pal.accent[3], 0.4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c0, y + 0.5 - c0);
      if (d <= r) {
        // Lit from the top left: the lower right limb is a shade darker.
        const limb = (x - c0) + (y - c0) > r * 0.7 && d > r * 0.55;
        const crater = night && (Math.hypot(x - c0 + r * 0.3, y - c0 + r * 0.1) < r * 0.22 || Math.hypot(x - c0 - r * 0.25, y - c0 - r * 0.35) < r * 0.14);
        pc.set(x, y, limb || crater ? shadow : disc);
      } else if (d < r * 2) {
        const a = (1 - (d - r) / r) ** 2;
        if (a * 16 > BAYER4[(y % 4) * 4 + (x % 4)]! * 0.9) pc.set(x, y, disc, Math.round(70 * a + 20));
      }
    }
  }
  return pc;
}

/** One layer of a starfield that tiles both ways (space settings scroll it). */
export function paintStars(pal: ArtPalette, w: number, h: number, seed: number, density: number, bright: boolean): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = hash2(x, y, seed);
      if (s < density) pc.set(x, y, bright && s < density * 0.3 ? pal.white : mix(pal.sky[0], pal.white, bright ? 0.6 : 0.3));
    }
  }
  return pc;
}

/** Value noise that repeats every `period` cells, so a layer built from it tiles seamlessly. */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => hash2(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Faint clouds of gas, dithered so they stay pixel art (space settings). */
export function paintNebula(pal: ArtPalette, size: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(size, size);
  const cell = size / 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = periodicNoise(x / cell, y / cell, 4, seed) * 0.6 + periodicNoise(x / (cell / 2), y / (cell / 2), 8, seed + 1) * 0.3 + periodicNoise(x / (cell / 4), y / (cell / 4), 16, seed + 2) * 0.1;
      const hue = periodicNoise(x / (cell * 2), y / (cell * 2), 2, seed + 3);
      const t = n - 0.5 + (BAYER4[(y % 4) * 4 + (x % 4)]! / 16 - 0.5) * 0.12;
      if (t <= 0) continue;
      // Gas in the accent hue or a lifted sky tone, never the danger hue: in a bullet game only bullets may glow red.
      const tint = hue > 0.5 ? pal.accent[1] : shade(pal.sky[1], 0.45);
      pc.set(x, y, mix(pal.sky[0], tint, t > 0.16 ? 0.24 : t > 0.08 ? 0.15 : 0.08));
    }
  }
  return pc;
}

/** A banded planet lit from the top left, with a thin atmosphere on its lit limb. */
export function paintPlanet(pal: ArtPalette, r: number): PixelCanvas {
  const size = r * 2 + 4;
  const pc = new PixelCanvas(size, size);
  const c0 = size / 2;
  const base = mix(pal.terrain[2], pal.accent[2], 0.25);
  const bands = [shade(base, 0.3), base, shade(base, -0.2), base, shade(base, 0.15)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c0;
      const dy = y + 0.5 - c0;
      const d = Math.hypot(dx, dy);
      if (d > r + 1) continue;
      if (d > r) {
        if (dx + dy < 0) pc.set(x, y, mix(pal.accent[3], pal.sky[0], 0.3), 150);
        continue;
      }
      const band = bands[Math.floor(((dy / r + 1) / 2) * bands.length * 1.6 + Math.sin(dx / 5) * 0.6) % bands.length]!;
      // Terminator: the far side falls into shadow, dithered across the boundary.
      const lightness = (-dx - dy) / (r * 1.6) + 0.35;
      const t = lightness + (BAYER4[(y % 4) * 4 + (x % 4)]! / 16 - 0.5) * 0.3;
      pc.set(x, y, t < -0.2 ? mix(band, pal.sky[0], 0.8) : t < 0.15 ? mix(band, pal.sky[0], 0.45) : band);
    }
  }
  return pc;
}

/** The rock around a top-down level smaller than the view: dark, faintly coursed, tiling both ways. */
export function paintVoid(pal: ArtPalette): PixelCanvas {
  const pc = new PixelCanvas(32, 32);
  const base = mix(pal.terrain[0], pal.ink, 0.55);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const row = Math.floor(y / 8);
      const joint = y % 8 === 7 || (x + (row % 2) * 8) % 16 === 15;
      const top = y % 8 === 0;
      pc.set(x, y, joint ? mix(base, pal.ink, 0.6) : top ? mix(base, pal.terrain[0], 0.4) : hash2(x, y, 131) < 0.04 ? mix(base, pal.terrain[1], 0.3) : base);
    }
  }
  return pc;
}

/** A soft round light for additive glows (pickups, projectiles, torches, the goal). */
export function paintGlow(r: number, c: RGB): PixelCanvas {
  const pc = new PixelCanvas(r * 2, r * 2);
  for (let y = 0; y < r * 2; y++) {
    for (let x = 0; x < r * 2; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (d < 1) pc.set(x, y, c, Math.round(255 * (1 - d) ** 2));
    }
  }
  return pc;
}

/** The ellipse a top-down character casts on the floor. */
export function paintShadow(w: number, h: number, ink: RGB): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h / 2) / (h / 2);
      if (dx * dx + dy * dy <= 1) pc.set(x, y, ink, 110);
    }
  }
  return pc;
}

/** Darkens toward the edges of the view. */
export function paintVignette(w: number, h: number, ink: RGB, strength: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h / 2) / (h / 2);
      const d = Math.sqrt(dx * dx * 0.8 + dy * dy);
      const a = Math.max(0, Math.min(1, (d - 0.55) / 0.6)) ** 1.6;
      if (a > 0) pc.set(x, y, ink, Math.round(255 * a * strength));
    }
  }
  return pc;
}

/** Every other row a little darker (the style card's crt effect). */
export function paintScanlines(w: number, h: number, ink: RGB): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = 1; y < h; y += 2) for (let x = 0; x < w; x++) pc.set(x, y, ink, 46);
  return pc;
}

/** Particle shapes, all white (particles are tinted when they are emitted). */
export const PARTICLES = {
  dot: ['#'],
  chunk: ['##', '##'],
  spark: ['.#.', '###', '.#.'],
  star: ['..#..', '..#..', '##.##', '..#..', '..#..'],
  ring: ['.###.', '#...#', '#...#', '#...#', '.###.'],
} as const;

export function paintParticle(shape: readonly string[], white: RGB): PixelCanvas {
  const pc = new PixelCanvas(shape[0]!.length, shape.length);
  shape.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') pc.set(x, y, white);
  });
  return pc;
}

// ---------------------------------------------------------------- decorations (recipes painted like sprites)

/** The goal of a side-view level: a banner on a pole, waving. */
export const FLAG: Recipe = {
  anchor: 'feet',
  anims: {
    idle: [
      ['UaAAAA.', 'UAbbbAA', 'UAbBbA.', 'UAAAAA.', 'U......', 'U......', 'U......', 'U......', 'U......', 'U......', 'U......', 'u......', 'tt.....'],
      ['UaAAA..', 'UAbbbAA', 'UAbBbAA', 'UAAAAA.', 'U......', 'U......', 'U......', 'U......', 'U......', 'U......', 'U......', 'u......', 'tt.....'],
      ['UaAAAA.', 'UAbbbA.', 'UAbBbAA', 'UAAAAAA', 'U......', 'U......', 'U......', 'U......', 'U......', 'U......', 'U......', 'u......', 'tt.....'],
    ],
  },
};

/** A wall torch for dungeons: a sconce and a two-frame flame. */
export const TORCH: Recipe = {
  anchor: 'center',
  anims: {
    idle: [
      ['.B.', 'bBb', 'AbA', '.a.', 'qQq', '.q.'],
      ['B..', 'bBb', 'bAA', '.a.', 'qQq', '.q.'],
    ],
  },
};
