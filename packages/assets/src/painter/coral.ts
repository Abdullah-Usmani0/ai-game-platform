// The coral theme: a sunlit reef kingdom under water.
import { hash2, PixelCanvas } from '@gg/sdk/art';
import { parseHex, type RGB } from '@gg/sdk/art';
import { bandAt, bayer, dith, fbm, fillCircle, vgradient } from './brush.js';

const H = (s: string) => parseHex(s);
export const ROLES = { background: '#063445', mid: '#1d7a80', foreground: '#fff1dc', accent: '#ff8a5c', danger: '#d7263d', ui: '#ffffff' };
const C = {
  water: ['#8fe0d6', '#5cc4c4', '#35a6b0', '#1e8698', '#13687f', '#0b4d66', '#073a50'].map(H),
  shaft: H('#b6f0e6'),
  farReef: ['#0d5568', '#11687a', '#177a88'].map(H),
  coral: ['#7a2a2a', '#c4473a', '#ff7a5a', '#ffad86', '#ffe0c8'].map(H),
  pink: ['#5a1f45', '#9c3a6e', '#e2639a', '#f59ac0', '#ffd6e6'].map(H),
  fan: ['#2c1f4a', '#4f3a85', '#7c62b8', '#a58fdc', '#d6c9f5'].map(H),
  gold: ['#5a3f12', '#a3741e', '#e8b440', '#f8d77c', '#fff2c4'].map(H),
  kelp: ['#0c2e24', '#155040', '#1f6e52', '#2f9068', '#58b884'].map(H),
  rock: ['#04222c', '#0a3644', '#11495a', '#1a5f70', '#2a7a88'].map(H),
  sand: ['#6a5a40', '#a08a62', '#cdb88a', '#e8d8ae', '#fff3d6'].map(H),
  bubble: H('#d8fbf6'),
};

export function coralFar(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  vgradient(pc, C.water, 0, h);
  // Light shafts slanting down from the surface, fading with depth.
  for (let y = 0; y < h * 0.85; y++) {
    for (let x = 0; x < w; x++) {
      const u = x + y * 0.45;
      const s = Math.sin(u * 0.045 + Math.sin(u * 0.011) * 2) * 0.5 + 0.5;
      const k = s * s * s * (1 - y / (h * 0.85));
      if (k > 0.18) pc.set(x, y, dith(x, y, pc.get(x, y), C.shaft, Math.min(1, (k - 0.18) * 1.6)));
    }
  }
  // Distant reef ridges, two layers, bumpy with coral heads.
  for (const [layer, base, amp] of [[0, 0.62, 30], [1, 0.72, 22]] as const) {
    for (let x = 0; x < w; x++) {
      const top = h * base - fbm(x, layer * 50, 34, seed + layer * 7, 3, w) * amp - (hash2(x >> 3, layer, seed) > 0.8 ? 4 : 0);
      for (let y = Math.floor(top); y < h; y++) pc.set(x, y, C.farReef[layer]!);
    }
  }
  // Drifting motes of light.
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(hash2(k, 1, seed) * w);
    const y = Math.floor(hash2(k, 2, seed) * h * 0.7);
    pc.set(x, y, C.shaft);
  }
  return pc;
}

/** A branching coral: a trunk that forks, each branch thinner, tips rounded. */
function branch(pc: PixelCanvas, x: number, y: number, ang: number, len: number, r: number, ramp: readonly RGB[], seed: number, depth: number): void {
  const steps = Math.max(2, Math.round(len));
  let px = x;
  let py = y;
  for (let i = 0; i < steps; i++) {
    const a = ang + Math.sin((i + seed) * 0.7) * 6;
    px += Math.cos((a * Math.PI) / 180);
    py += Math.sin((a * Math.PI) / 180);
    fillCircle(pc, px, py, r, (xx, yy, d) => ramp[d < 0.4 && xx < px ? 4 : d < 0.7 ? 3 : 2]!);
  }
  fillCircle(pc, px, py, r + 0.6, (xx) => ramp[xx < px ? 4 : 3]!);
  if (depth <= 0 || r < 1) return;
  const n = 2 + (hash2(Math.round(x), Math.round(y), seed) > 0.6 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const spread = (k - (n - 1) / 2) * (28 + hash2(k, depth, seed) * 14);
    branch(pc, px, py, ang + spread, len * 0.72, r * 0.72, ramp, seed + k + 1, depth - 1);
  }
}

export function coralMid(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const floor = Math.round(h * 0.86);
  // Rock shelves the corals grow on.
  for (let x = 0; x < w; x++) {
    const top = floor - 18 - fbm(x, 3, 40, seed + 4, 3, w) * 46;
    for (let y = Math.floor(top); y < h; y++) {
      const edge = y - top < 2;
      pc.set(x, y, edge ? C.rock[3]! : C.rock[fbm(x, y, 6, seed + 8) > 0.6 ? 1 : 2]!);
    }
  }
  // Fan corals: a fan of fine radial strokes.
  for (let k = 0; k < 5; k++) {
    const cx = (k + 0.5) * (w / 5) + (hash2(k, 3, seed) - 0.5) * 40;
    const by = floor - 30 - hash2(k, 4, seed) * 30;
    for (let s = -7; s <= 7; s++) {
      const a = -90 + s * 9;
      for (let r = 0; r < 26; r++) {
        const x = Math.round(cx + Math.cos((a * Math.PI) / 180) * r);
        const y = Math.round(by + Math.sin((a * Math.PI) / 180) * r);
        if (bayer(x, y) < 0.8) pc.set(x, y, C.fan[r > 20 ? 3 : r > 10 ? 2 : 1]!);
      }
    }
  }
  // Branching corals in coral and pink, brain corals in gold.
  for (let k = 0; k < 7; k++) {
    const cx = (k + 0.3) * (w / 7) + hash2(k, 5, seed) * 30;
    const base = floor - 22 - fbm(cx, 3, 40, seed + 4, 3, w) * 30;
    branch(pc, cx, base, -90 + (hash2(k, 6, seed) - 0.5) * 30, 14, 2.6, k % 2 ? C.coral : C.pink, seed + k * 13, 3);
  }
  // Brain corals: half domes sitting on the rock, grooved.
  for (let k = 0; k < 6; k++) {
    const cx = hash2(k, 9, seed) * w;
    let cy = 0;
    while (cy < h && !pc.alpha(Math.round(cx), cy)) cy++;
    const r = 6 + hash2(k, 11, seed) * 4;
    fillCircle(pc, cx, cy + 2, r, (x, y, d) => (y > cy + 2 ? null : C.gold[d > 0.88 ? 1 : Math.abs(Math.sin((x - cx) * 0.9 + (y - cy) * 0.5)) < 0.25 ? 1 : x < cx - r * 0.2 ? 3 : 2]!));
  }
  return pc;
}

export function coralNear(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  // Kelp strands rising from the edges, swaying.
  for (const [x0, n] of [[8, 4], [w - 40, 4]] as const) {
    for (let k = 0; k < n; k++) {
      const bx = x0 + k * 8;
      const top = h * (0.15 + hash2(k, x0, seed) * 0.3);
      for (let y = Math.floor(top); y < h; y++) {
        const sway = Math.sin(y * 0.06 + k) * 4;
        const wdt = 3 + Math.round(Math.sin(y * 0.15 + k * 2) + 1);
        for (let i = 0; i < wdt; i++) pc.set(Math.round(bx + sway + i), y, C.kelp[i === 0 ? 3 : i === wdt - 1 ? 1 : 2]!);
        if (y % 14 === 0) fillCircle(pc, bx + sway + 5, y, 2.2, () => C.kelp[3]!);
      }
    }
  }
  // Bubbles.
  for (let k = 0; k < 14; k++) {
    const x = hash2(k, 21, seed) * w;
    const y = hash2(k, 22, seed) * h * 0.8;
    const r = 1 + hash2(k, 23, seed) * 2.5;
    fillCircle(pc, x, y, r, (xx, yy, d) => (d > 0.7 ? C.bubble : d < 0.35 && xx < x && yy < y ? C.bubble : null));
  }
  return pc;
}

export function coralFloor(w: number, h: number, top: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = top; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ripple = Math.sin(x * 0.16 + fbm(x, y, 12, seed + 1) * 4 + y * 0.9);
      let c = C.sand[y === top ? 4 : y === top + 1 ? 3 : ripple > 0.85 ? 3 : ripple < -0.9 ? 1 : 2]!;
      if (hash2(x, y, seed + 3) > 0.985) c = C.coral[3]!;
      pc.set(x, y, bandAt(x, y, [c, c, C.sand[1]!], (y - top) / (h - top)));
    }
  }
  return pc;
}

/** Every colour this theme paints with: its layers are quantised to these, so they never leave the palette. */
export const PALETTE: readonly RGB[] = [...Object.values(C).flatMap((v) => (Array.isArray(v[0]) ? (v as RGB[]) : [v as RGB]))];
