// The frost theme: a frozen clockwork city at night.
import { hash2, PixelCanvas } from '@gg/sdk/art';
import { parseHex, type RGB } from '@gg/sdk/art';
import { bandAt, bayer, dith, fbm, fillCircle, fillPoly, fillRect, vgradient } from './brush.js';

const H = (s: string) => parseHex(s);
export const ROLES = { background: '#1a2133', mid: '#5a6f8c', foreground: '#eef4ff', accent: '#f2b84b', danger: '#d6455d', ui: '#ffffff' };
const F = {
  sky: ['#070b16', '#0d1424', '#16203a', '#22304f', '#334566', '#4a5d80'].map(H),
  aurora: ['#2a8f7a', '#4fd1a8', '#9af5d0'].map(H),
  star: H('#cfe0ff'),
  far: ['#121a2c', '#19233a', '#22304a'].map(H),
  clock: ['#6a4a1c', '#c9902e', '#f2c45a', '#fff0b8'].map(H),
  wall: ['#141a29', '#202a40', '#2e3a56', '#43526f', '#5e7090'].map(H),
  snow: ['#8aa0c4', '#b8c8e4', '#dce6f6', '#f4f8ff', '#ffffff'].map(H),
  window: ['#7a4a1a', '#d08a2e', '#f5c05a'].map(H),
  brass: ['#3a2a14', '#6e5226', '#a87e3a', '#d8aa58', '#f4d690'].map(H),
  ice: ['#5a7aa8', '#8fb0d8', '#c4dcf4', '#ecf6ff'].map(H),
  ink: H('#070a12'),
};

/** A gear: a toothed ring round a hub, as a silhouette. */
function gear(pc: PixelCanvas, cx: number, cy: number, r: number, teeth: number, col: RGB, hole: boolean): void {
  for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++) {
    for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      const tooth = Math.cos(a * teeth) > 0.3 ? 3 : 0;
      if (d <= r + tooth && !(hole && d < r * 0.35) && !(d < r * 0.75 && d > r * 0.45 && Math.cos(a * 5) > 0.6)) pc.set(x, y, col);
    }
  }
}

export function frostFar(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const horizon = Math.round(h * 0.74);
  vgradient(pc, F.sky, 0, horizon + 10);
  for (let k = 0; k < 120; k++) pc.set(Math.floor(hash2(k, 1, seed) * w), Math.floor(hash2(k, 2, seed) * h * 0.5), F.star);
  // An aurora: curtains of light hanging from a ribbon that folds across the sky, streaked top to bottom.
  for (let x = 0; x < w; x++) {
    const cy = h * 0.12 + Math.sin(x * 0.018 + 1) * 12 + Math.sin(x * 0.047) * 4;
    const streak = 0.55 + 0.45 * Math.sin(x * 0.9 + Math.sin(x * 0.13) * 3);
    for (let y = Math.floor(cy - 4); y < cy + 34; y++) {
      const down = (y - cy + 4) / 38;
      const t = (1 - down) * streak * (0.6 + 0.4 * fbm(x, 0, 30, seed + 3, 2, w));
      if (t > 0.12) pc.set(x, y, dith(x, y, pc.get(x, y), F.aurora[t > 0.62 ? 2 : t > 0.34 ? 1 : 0]!, Math.min(1, t * 1.6)));
    }
  }
  // Clock towers and great gears on the skyline.
  for (let k = 0; k < 4; k++) {
    const tx = (k + 0.5) * (w / 4) + (hash2(k, 3, seed) - 0.5) * 40;
    const tw = 22 + Math.floor(hash2(k, 4, seed) * 12);
    const th = 70 + Math.floor(hash2(k, 5, seed) * 50);
    gear(pc, tx + (k % 2 ? 30 : -26), horizon - th * 0.55, 16 + hash2(k, 6, seed) * 10, 10, F.far[0]!, true);
    fillRect(pc, tx - tw / 2, horizon - th, tw, th, () => F.far[1]!);
    fillPoly(pc, [{ x: tx - tw / 2 - 3, y: horizon - th }, { x: tx, y: horizon - th - tw * 1.2 }, { x: tx + tw / 2 + 3, y: horizon - th }], () => F.far[1]!);
    fillCircle(pc, tx, horizon - th + 16, tw * 0.32, (x, y, d) => (d > 0.82 ? F.clock[1]! : F.clock[d < 0.25 ? 3 : 2]!));
    // The clock's hands.
    for (let i = 0; i < tw * 0.28; i++) {
      pc.set(Math.round(tx), Math.round(horizon - th + 16 - i * 0.9), F.clock[0]!);
      pc.set(Math.round(tx + i * 0.6), Math.round(horizon - th + 16), F.clock[0]!);
    }
  }
  // Rooftops beneath, in haze.
  for (let x = 0; x < w; x++) {
    const top = horizon - 10 - Math.abs(((x % 36) - 18)) * 0.9 - (hash2(x / 36, 2, seed) * 14);
    for (let y = Math.floor(top); y < h; y++) pc.set(x, y, bandAt(x, y, [F.far[2]!, F.far[1]!, F.sky[1]!], (y - top) / (h - top)));
  }
  return pc;
}

export function frostMid(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const floor = Math.round(h * 0.86);
  let x = -6;
  let i = 0;
  while (x < w + 6) {
    const bw = 44 + Math.floor(hash2(i, 1, seed) * 30);
    const bh = 60 + Math.floor(hash2(i, 2, seed) * 60);
    const top = floor - bh;
    // The wall, lit on the left; a steep roof capped with snow.
    fillRect(pc, x, top, bw, bh, (xx, yy) => F.wall[xx - x < 3 ? 3 : (xx + Math.floor(yy / 7)) % 11 === 0 ? 1 : 2]!);
    const roof = hash2(i, 12, seed);
    if (roof < 0.45) fillPoly(pc, [{ x: x - 4, y: top }, { x: x + bw / 2, y: top - bw * 0.55 }, { x: x + bw + 4, y: top }], (xx, yy) => (yy < top - bw * 0.55 + 5 + (xx % 5) || yy > top - 3 ? F.snow[(xx + yy) % 4 === 0 ? 2 : 3]! : F.wall[1]!));
    else if (roof < 0.75) {
      // A flat roof behind a crenellated parapet, snow along it.
      fillRect(pc, x - 2, top - 8, bw + 4, 8, (xx, yy) => (yy === top - 8 || (yy < top - 4 && (xx - x) % 8 < 4) ? F.snow[3]! : yy < top - 4 && (xx - x) % 8 >= 4 ? null : F.wall[1]!));
    } else {
      // An onion dome on a drum, a brass spike on top.
      fillRect(pc, x + bw / 2 - 9, top - 10, 18, 10, () => F.wall[1]!);
      fillCircle(pc, x + bw / 2, top - 18, 12, (xx, yy, d) => (yy < top - 26 + (xx % 3) ? F.snow[3]! : F.brass[d < 0.5 && xx < x + bw / 2 ? 3 : d > 0.85 ? 1 : 2]!));
      fillRect(pc, x + bw / 2, top - 36, 1, 8, () => F.brass[3]!);
    }
    // Lit windows in rows, some dark.
    for (let r = 0; r < Math.floor(bh / 22); r++) {
      for (let c = 0; c < Math.floor(bw / 14); c++) {
        const wx = x + 6 + c * 14;
        const wy = top + 10 + r * 22;
        const lit = hash2(i * 9 + c, r, seed) > 0.45;
        const arched = i % 3 === 1;
        fillRect(pc, wx, wy, 6, 9, (xx, yy) => (arched && yy === wy && (xx === wx || xx === wx + 5) ? null : lit ? F.window[yy === wy + 1 ? 2 : xx === wx ? 0 : 1]! : F.wall[0]!));
        if (lit && hash2(i, r * 7 + c, seed) > 0.6) fillRect(pc, wx + 2, wy + 1, 1, 8, () => F.window[0]!);
        fillRect(pc, wx - 1, wy + 9, 8, 1, () => F.snow[3]!);
      }
    }
    // A chimney with steam, and a brass pipe down the wall.
    if (hash2(i, 7, seed) > 0.4) {
      const cx = x + bw * 0.7;
      fillRect(pc, cx, top - bw * 0.35, 6, bw * 0.3, () => F.brass[1]!);
      for (let k = 0; k < 18; k++) fillCircle(pc, cx + 3 + Math.sin(k * 0.6) * 3 + k * 0.4, top - bw * 0.35 - k * 2.2, 2 + k * 0.12, (xx, yy) => (bayer(xx, yy) < 0.55 - k * 0.025 ? F.snow[1]! : null));
    }
    fillRect(pc, x + bw - 6, top + 8, 3, bh - 8, (xx) => F.brass[xx === x + bw - 6 ? 3 : 2]!);
    x += bw + 8 + Math.floor(hash2(i, 8, seed) * 10);
    i++;
  }
  return pc;
}

export function frostNear(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  // Icicles hanging from an iron beam across the top.
  fillRect(pc, 0, 0, w, 6, (x, y) => (y === 5 ? F.ice[1]! : F.ink));
  for (let x = 2; x < w; x += 5 + Math.floor(hash2(x, 1, seed) * 6)) {
    const len = 4 + Math.floor(hash2(x, 2, seed) * 18);
    fillPoly(pc, [{ x: x - 1.5, y: 6 }, { x: x + 1.5, y: 6 }, { x: x + 0.2, y: 6 + len }], (xx) => F.ice[xx < x ? 3 : 2]!);
  }
  // A great gear and a pipe at the corners, in near-black.
  gear(pc, -8, h * 0.62, 34, 12, F.ink, false);
  fillRect(pc, w - 16, 0, 10, h, (x) => (x === w - 16 ? F.brass[1]! : F.ink));
  // Snowflakes.
  for (let k = 0; k < 80; k++) {
    const x = Math.floor(hash2(k, 31, seed) * w);
    const y = Math.floor(hash2(k, 32, seed) * h);
    pc.set(x, y, F.snow[4]!);
    if (k % 4 === 0) {
      pc.set(x + 1, y, F.snow[2]!);
      pc.set(x, y + 1, F.snow[2]!);
    }
  }
  return pc;
}

export function frostFloor(w: number, h: number, top: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = top; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const drift = 4 + Math.round(fbm(x, 0, 20, seed + 5, 2, w) * 5);
      let c: RGB;
      if (y - top < drift) c = F.snow[y === top ? 4 : y - top === drift - 1 ? 1 : (x + y) % 7 === 0 ? 2 : 3]!;
      else {
        const row = Math.floor((y - top - drift) / 7);
        const bx = (x + (row % 2 ? 6 : 0)) % 12;
        const by = (y - top - drift) % 7;
        c = bx === 0 || by === 6 ? F.wall[0]! : F.wall[by < 2 ? 3 : 2]!;
        if (by === 0 && bx > 2 && hash2(x, y, seed) > 0.5) c = F.snow[1]!;
      }
      pc.set(x, y, c);
    }
  }
  return pc;
}

/** Every colour this theme paints with: its layers are quantised to these, so they never leave the palette. */
export const PALETTE: readonly RGB[] = [...Object.values(F).flatMap((v) => (Array.isArray(v[0]) ? (v as RGB[]) : [v as RGB]))];
