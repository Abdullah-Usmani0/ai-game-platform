import type { Tilemap } from './tilemap.js';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  hitWall: boolean;
  hitCeiling: boolean;
  /** -1 or 1 */
  facing: number;
}

/** Move a body by (dx, dy) in pixels, resolving AABB collisions against the tilemap one axis at a time. */
export function moveBody(map: Tilemap, b: Body, dx: number, dy: number): void {
  b.hitWall = false;
  b.hitCeiling = false;
  // X axis in sub-steps no larger than one tile to avoid tunnelling.
  const stepX = Math.sign(dx) * Math.min(Math.abs(dx), map.tileSize - 1);
  let remX = dx;
  while (Math.abs(remX) > 1e-9) {
    const s = Math.abs(remX) < Math.abs(stepX) || stepX === 0 ? remX : stepX;
    if (map.isSolid(b.x + s, b.y, b.w, b.h)) {
      // Snap to the wall.
      const ts = map.tileSize;
      if (s > 0) b.x = Math.floor((b.x + b.w + s) / ts) * ts - b.w - 1e-6;
      else b.x = Math.ceil((b.x + s) / ts) * ts + 1e-6;
      b.vx = 0;
      b.hitWall = true;
      break;
    }
    b.x += s;
    remX -= s;
  }
  // Y axis.
  const prevFeet = b.y + b.h;
  const stepY = Math.sign(dy) * Math.min(Math.abs(dy), map.tileSize - 1);
  let remY = dy;
  b.grounded = false;
  while (Math.abs(remY) > 1e-9) {
    const s = Math.abs(remY) < Math.abs(stepY) || stepY === 0 ? remY : stepY;
    const nextY = b.y + s;
    const ts = map.tileSize;
    if (map.isSolid(b.x, nextY, b.w, b.h)) {
      if (s > 0) {
        b.y = Math.floor((nextY + b.h) / ts) * ts - b.h - 1e-6;
        b.grounded = true;
      } else {
        b.y = Math.ceil(nextY / ts) * ts + 1e-6;
        b.hitCeiling = true;
      }
      b.vy = 0;
      break;
    }
    if (s > 0 && map.isOneWayBelow(b.x, nextY + b.h, b.w, prevFeet)) {
      b.y = Math.floor((nextY + b.h) / ts) * ts - b.h - 1e-6;
      b.grounded = true;
      b.vy = 0;
      break;
    }
    b.y = nextY;
    remY -= s;
  }
  if (dy === 0 || remY === 0) {
    // Standing check when not moving down: are we resting on solid or one-way?
    if (!b.grounded && map.isSolid(b.x, b.y + b.h + 0.01, b.w, 0.02)) b.grounded = true;
    if (!b.grounded && map.isOneWayBelow(b.x, b.y + b.h + 0.01, b.w, b.y + b.h)) b.grounded = true;
  }
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}
