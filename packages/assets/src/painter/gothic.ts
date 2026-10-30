// The gothic theme: a moonlit cathedral city (far), a ruined arcade (mid), pillars, chains and candles (near).
import { hash2, PixelCanvas } from '@gg/sdk/art';
import { mix, parseHex, type RGB } from '@gg/sdk/art';
import { bandAt, bayer, dith, fbm, fillCircle, fillPoly, fillRect, pointedArch, vgradient } from './brush.js';

const H = (s: string) => parseHex(s);
const MOSS = ['#1c2416', '#2e3a22', '#465630'].map((c) => parseHex(c));
/** The palette roles a game in this theme would have (the hero's materials come from them). */
export const ROLES = { background: '#0d0a12', mid: '#3b3346', foreground: '#e8dcc8', accent: '#d9a441', danger: '#a3172a', ui: '#efe6d2' };
export const GOTHIC = {
  sky: ['#06050a', '#0b0913', '#130f1f', '#1d162d', '#2b1f3b', '#3d2a47'].map(H),
  moon: H('#efe4cc'),
  moonShade: H('#c9b89a'),
  halo: H('#4a3a58'),
  far: H('#120e1a'),
  farLit: H('#1c1626'),
  window: H('#c98f3a'),
  windowDim: H('#5a3a2a'),
  mist: H('#2a2034'),
  stone: ['#0c0a10', '#1a1620', '#2a2431', '#3c3445', '#544a5c'].map(H),
  ink: H('#050308'),
  flame: ['#5a2a14', '#b8561e', '#e89a3a', '#f6d27a', '#fff3c8'].map(H),
  chain: H('#2a2430'),
};

export function gothicFar(w: number, h: number, seed: number): PixelCanvas {
  const g = GOTHIC;
  const pc = new PixelCanvas(w, h);
  const horizon = Math.round(h * 0.72);
  vgradient(pc, g.sky, 0, horizon + 20);
  // The moon and its halo.
  const mx = Math.round(w * 0.72);
  const my = Math.round(h * 0.24);
  fillCircle(pc, mx, my, 46, (x, y, d) => (d > 0.55 ? (bayer(x, y) < (1 - d) * 0.9 ? g.halo : null) : bayer(x, y) < 0.55 ? g.halo : null));
  fillCircle(pc, mx, my, 22, (x, y, d) => {
    const crater = fbm(x, y, 7, seed + 3) > 0.62;
    return crater ? g.moonShade : d > 0.86 && x > mx ? g.moonShade : g.moon;
  });
  // Clouds: drifting bands that cross the moon.
  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < w; x++) {
      const band = Math.max(0, 1 - Math.abs(y - h * 0.3) / (h * 0.16));
      const n = fbm(x * 0.6, y * 2.2, 40, seed + 11, 4, w * 0.6) * band;
      if (n > 0.42) pc.set(x, y, dith(x, y, mix(g.sky[2]!, g.halo, 0.5), mix(g.sky[3]!, g.moonShade, 0.25), (n - 0.42) * 3.5));
    }
  }
  // The skyline: houses, towers, spires and one great cathedral, darkest against the glowing horizon.
  const sil = (x: number, y: number): RGB => (y > horizon - 6 ? dith(x, y, g.far, g.mist, (y - horizon + 6) / 30) : g.far);
  let x = -10;
  let i = 0;
  while (x < w + 10) {
    const r = hash2(i, 7, seed);
    const kind = x > w * 0.42 && x < w * 0.58 ? 'cathedral' : r < 0.35 ? 'tower' : r < 0.55 ? 'spire' : 'house';
    if (kind === 'cathedral') {
      const cw = 96;
      const top = horizon - 78;
      fillRect(pc, x, top + 30, cw, horizon - top, sil);
      for (const tx of [x + 6, x + cw - 24]) {
        fillRect(pc, tx, top - 10, 18, horizon - top + 10, sil);
        fillPoly(pc, [{ x: tx - 2, y: top - 10 }, { x: tx + 9, y: top - 58 }, { x: tx + 20, y: top - 10 }], sil);
        for (let k = 0; k < 3; k++) fillRect(pc, tx + 7, top + k * 16, 4, 7, (wx, wy) => (hash2(wx, wy, seed + k) > 0.3 ? g.windowDim : g.window));
      }
      fillPoly(pc, [{ x: x + 24, y: top + 30 }, { x: x + cw / 2, y: top + 8 }, { x: x + cw - 24, y: top + 30 }], sil);
      fillCircle(pc, x + cw / 2, top + 44, 9, (wx, wy, d) => (d > 0.75 ? null : (Math.floor((wx + wy) / 2) % 2 === 0 ? g.window : g.windowDim)));
      for (let k = 0; k < 3; k++) fillPoly(pc, pointedArch(x + 28 + k * 14, top + 58, 8, 18), () => g.windowDim);
      x += cw + 6;
    } else if (kind === 'tower') {
      const tw = 10 + Math.floor(r * 8);
      const th = 40 + Math.floor(hash2(i, 9, seed) * 50);
      fillRect(pc, x, horizon - th, tw, th, sil);
      fillPoly(pc, [{ x: x - 2, y: horizon - th }, { x: x + tw / 2, y: horizon - th - tw * 1.8 }, { x: x + tw + 2, y: horizon - th }], sil);
      if (hash2(i, 13, seed) > 0.4) fillRect(pc, x + Math.floor(tw / 2) - 1, horizon - th + 8, 2, 3, () => g.window);
      x += tw + 4 + Math.floor(hash2(i, 5, seed) * 10);
    } else if (kind === 'spire') {
      const sh = 50 + Math.floor(r * 60);
      fillRect(pc, x + 2, horizon - sh * 0.5, 6, sh * 0.5, sil);
      fillPoly(pc, [{ x: x, y: horizon - sh * 0.5 }, { x: x + 5, y: horizon - sh }, { x: x + 10, y: horizon - sh * 0.5 }], sil);
      x += 12 + Math.floor(hash2(i, 5, seed) * 8);
    } else {
      const hw = 18 + Math.floor(r * 22);
      const hh = 14 + Math.floor(hash2(i, 9, seed) * 20);
      fillRect(pc, x, horizon - hh, hw, hh, sil);
      fillPoly(pc, [{ x: x - 2, y: horizon - hh }, { x: x + hw / 2, y: horizon - hh - hw * 0.45 }, { x: x + hw + 2, y: horizon - hh }], sil);
      for (let k = 0; k < 2; k++) if (hash2(i, 20 + k, seed) > 0.55) fillRect(pc, x + 4 + k * 8, horizon - hh + 5, 2, 3, () => g.window);
      x += hw + 2 + Math.floor(hash2(i, 5, seed) * 6);
    }
    i++;
  }
  // Ground mist below the roofs.
  for (let y = horizon; y < h; y++) for (let xx = 0; xx < w; xx++) pc.set(xx, y, bandAt(xx, y, [g.mist, g.far, g.sky[1]!], (y - horizon) / (h - horizon)));
  return pc;
}

export function gothicMid(w: number, h: number, seed: number): PixelCanvas {
  const g = GOTHIC;
  const pc = new PixelCanvas(w, h);
  const floor = Math.round(h * 0.86);
  const bay = 64;
  // A ruined arcade: columns, pointed arches, broken tops; lit from the moon on the right.
  for (let b = -1; b < Math.ceil(w / bay) + 1; b++) {
    const x0 = b * bay;
    const broken = hash2(b, 3, seed) < 0.3;
    const colW = 12;
    const top = Math.round(h * 0.18) + (broken ? Math.floor(hash2(b, 4, seed) * 50) : 0);
    // A fluted column: lit on the moon's side, dark on the other, a groove every 3 px, moss creeping up from the base.
    const shadeCol = (x: number, y: number): RGB => {
      const t = (x - x0) / colW;
      let base = t < 0.25 ? 3 : t < 0.6 ? 2 : 1;
      if ((x - x0) % 3 === 2) base -= 1;
      if (hash2(x, y >> 2, seed + b) > 0.93) base -= 1;
      const moss = y > floor - 26 && fbm(x, y, 4, seed + 77) > 0.55 + (floor - y) / 60;
      return moss ? MOSS[Math.max(0, Math.min(2, base - 1))]! : g.stone[Math.max(0, Math.min(4, base))]!;
    };
    fillRect(pc, x0, top + 20, colW, floor - top - 20, shadeCol);
    fillRect(pc, x0 - 3, top + 16, colW + 6, 5, (x, y) => g.stone[y === top + 16 ? 3 : x < x0 + 4 ? 2 : 1]!);
    fillRect(pc, x0 - 3, floor - 6, colW + 6, 6, (x, y) => g.stone[y === floor - 6 ? 3 : x < x0 + 4 ? 2 : 1]!);
    // The arch to the next column: a band of voussoirs with a pointed opening.
    if (!broken) {
      const ax = x0 + colW;
      const aw = bay - colW;
      // Both edges spring from the capitals' line.
      const cap = top + 18;
      const outer = pointedArch(ax - 5, cap - (aw + 10) * 0.866, aw + 10, 2);
      const inner = pointedArch(ax + 1, cap - (aw - 2) * 0.866, aw - 2, 3);
      fillPoly(pc, outer, (x) => g.stone[x < ax + aw / 2 ? 2 : 1]!);
      fillPoly(pc, inner, (x, y) => {
        pc.clear(x, y);
        return null;
      });
      // Joints between the voussoirs, radiating from the opening's centre, and a lit edge underneath.
      const cx = ax + aw / 2;
      const cy = top + 30;
      for (let y = top - 16; y < top + 34; y++) {
        for (let x = ax - 6; x < ax + aw + 6; x++) {
          if (!pc.alpha(x, y)) continue;
          const ang = Math.atan2(y - cy, x - cx);
          if (Math.abs(Math.sin(ang * 9)) < 0.08) pc.set(x, y, g.stone[0]!);
          if (!pc.alpha(x, y + 1) && y < top + 30) pc.set(x, y, g.stone[3]!);
        }
      }
      // Ivy hanging from the arch.
      for (let k = 0; k < 4; k++) {
        const vx = ax + 4 + Math.floor(hash2(b, 40 + k, seed) * (aw - 8));
        const len = 6 + Math.floor(hash2(b, 50 + k, seed) * 22);
        let sy = top - 4;
        while (sy < top + 40 && !pc.alpha(vx, sy + 1) === false) sy++;
        for (let y = 0; y < len; y++) {
          const xx = vx + Math.round(Math.sin((y + k * 3) * 0.6) * 0.8);
          if (hash2(xx, sy + y, seed + 5) > 0.2) pc.set(xx, sy + y, MOSS[y % 3 === 0 ? 2 : 1]!);
          if (y % 4 === 1) pc.set(xx + (y % 8 < 4 ? 1 : -1), sy + y, MOSS[2]!);
        }
      }
    } else {
      // A broken stump of arch.
      fillPoly(pc, [{ x: x0 + colW, y: top + 16 }, { x: x0 + colW + 14, y: top + 8 + hash2(b, 6, seed) * 10 }, { x: x0 + colW + 10, y: top + 24 }], () => g.stone[1]!);
    }
  }
  // The floor line.
  fillRect(pc, 0, floor, w, h - floor, (x, y) => g.stone[y === floor ? 2 : 1]!);
  return pc;
}

export function gothicNear(w: number, h: number, seed: number): PixelCanvas {
  const g = GOTHIC;
  const pc = new PixelCanvas(w, h);
  // Two great pillars at the edges, in near-black.
  for (const [x0, pw, litSide] of [[-6, 34, 1], [w - 22, 30, -1]] as const) {
    const edge = litSide > 0 ? x0 + pw - 1 : x0;
    fillRect(pc, x0, 0, pw, h, (x, y) => {
      const fromEdge = Math.abs(x - edge);
      const band = y % 48 < 3;
      if (fromEdge === 0) return band ? g.stone[2]! : dith(x, y, g.stone[0]!, g.stone[1]!, 0.5);
      if (fromEdge < 3) return dith(x, y, g.ink, g.stone[0]!, 0.6 - fromEdge * 0.2);
      return band && fromEdge < 8 ? g.stone[0]! : g.ink;
    });
  }
  // Hanging chains with a cage.
  for (const cx of [Math.round(w * 0.3), Math.round(w * 0.62)]) {
    const len = 30 + Math.floor(hash2(cx, 1, seed) * 40);
    for (let y = 0; y < len; y++) if (y % 3 !== 2) pc.set(cx + (y % 6 < 3 ? 0 : 1), y, g.chain);
    if (cx > w * 0.5) {
      fillRect(pc, cx - 6, len, 13, 16, (x, y) => ((x - cx + 6) % 3 === 0 || y === len || y === len + 15 ? g.chain : null));
    }
  }
  // Candles on the pillar ledges.
  for (const [cx, cy] of [[22, Math.round(h * 0.62)], [w - 14, Math.round(h * 0.55)]] as const) {
    fillCircle(pc, cx, cy - 6, 14, (x, y, d) => (bayer(x, y) < (1 - d) * 0.35 ? g.flame[1]! : null));
    fillRect(pc, cx - 1, cy - 4, 3, 7, () => H('#d8cdb8'));
    fillRect(pc, cx, cy - 7, 1, 3, (x, y) => g.flame[y === cy - 7 ? 4 : 3]!);
  }
  return pc;
}

/** A flagstone floor: blocks with mortar, a worn lit top edge, moss in the joints. */
export function gothicFloor(w: number, h: number, top: number, seed: number): PixelCanvas {
  const g = GOTHIC;
  const pc = new PixelCanvas(w, h);
  for (let y = top; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const row = Math.floor((y - top) / 9);
      const off = row % 2 ? 11 : 0;
      const bx = (x + off) % 22;
      const by = (y - top) % 9;
      let c: RGB = g.stone[y - top < 2 ? 3 : by < 2 ? 2 : 1]!;
      if (bx === 0 || by === 8) c = g.stone[0]!;
      if (hash2(x, y, seed + 9) > 0.96) c = g.stone[0]!;
      if ((bx === 0 || by === 8) && fbm(x, y, 5, seed + 3) > 0.62) c = MOSS[1]!;
      if (y === top) c = g.stone[4]!;
      pc.set(x, y, c);
    }
  }
  return pc;
}

/** Every colour this theme paints with: its layers are quantised to these, so they never leave the palette. */
export const PALETTE: readonly RGB[] = [...Object.values(GOTHIC).flatMap((v) => (Array.isArray(v[0]) ? (v as RGB[]) : [v as RGB])), ...MOSS];
