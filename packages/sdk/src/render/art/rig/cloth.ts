import { lerp, plus, polar, type Vec } from './geometry.js';

/** A hanging chain of points (a cape's edge, a plume, a scarf), stepped with verlet integration. */
export interface Chain {
  pts: Vec[];
  prev: Vec[];
  seg: number;
}

export function chain(anchor: Vec, n: number, seg: number, deg = 100): Chain {
  const pts = Array.from({ length: n }, (_, i) => plus(anchor, polar(deg, seg * i)));
  return { pts, prev: pts.map((p) => ({ ...p })), seg };
}

/**
 * One verlet step: the first point follows the anchor; gravity and wind pull the rest, damped; the links keep their
 * length; and no point crosses `bodyX` toward the front of a body that faces east.
 */
export function stepChain(c: Chain, anchor: Vec, wind: number, gravity: number, damping: number, bodyX: number): void {
  c.pts[0] = { ...anchor };
  c.prev[0] = { ...anchor };
  for (let i = 1; i < c.pts.length; i++) {
    const p = c.pts[i]!;
    const q = c.prev[i]!;
    c.prev[i] = { ...p };
    c.pts[i] = { x: p.x + (p.x - q.x) * damping + wind, y: p.y + (p.y - q.y) * damping + gravity };
  }
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < c.pts.length; i++) {
      const a = c.pts[i - 1]!;
      const b = c.pts[i]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const k = (d - c.seg) / d;
      if (i === 1) c.pts[i] = { x: b.x - dx * k, y: b.y - dy * k };
      else {
        c.pts[i - 1] = { x: a.x + dx * k * 0.5, y: a.y + dy * k * 0.5 };
        c.pts[i] = { x: b.x - dx * k * 0.5, y: b.y - dy * k * 0.5 };
      }
      c.pts[0] = { ...anchor };
    }
    for (let i = 1; i < c.pts.length; i++) if (c.pts[i]!.x > bodyX) c.pts[i] = { x: bodyX, y: c.pts[i]!.y };
  }
}

/**
 * Cloth along a chain: a strip from `top` to `bottom` px wide on one side of it (behind a body that faces east while
 * it hangs, above it as it streams back), with a ragged hem of `teeth` points.
 */
export function strip(points: readonly Vec[], top: number, bottom: number, teeth: number): Vec[] {
  const n = points.length;
  const back: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const w = lerp(top, bottom, i / (n - 1));
    back.push({ x: points[i]!.x - (dy / d) * w, y: points[i]!.y + (dx / d) * w });
  }
  const last = points[n - 1]!;
  const lastBack = back[n - 1]!;
  const ex = lastBack.x - last.x;
  const ey = lastBack.y - last.y;
  const el = Math.sqrt(ex * ex + ey * ey) || 1;
  const hem: Vec[] = [];
  for (let k = 1; k < teeth * 2; k++) {
    const t = k / (teeth * 2);
    const drop = k % 2 ? 2.4 : 0;
    hem.push({ x: lerp(last.x, lastBack.x, t) + (ey / el) * drop, y: lerp(last.y, lastBack.y, t) - (ex / el) * drop });
  }
  return [...points, ...hem, ...back.reverse()];
}

/** The band a blade's tip sweeps between two angles round a pivot: full at the blade, thinning behind it. */
export function smear(pivot: Vec, from: number, to: number, r: number, thick: number, steps = 8): Vec[] {
  const out: Vec[] = [];
  const inn: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = lerp(from, to, t);
    out.push(plus(pivot, polar(a, r + 0.6)));
    inn.push(plus(pivot, polar(a, r + 0.6 - Math.max(1, thick * t))));
  }
  return [...out, ...inn.reverse()];
}
