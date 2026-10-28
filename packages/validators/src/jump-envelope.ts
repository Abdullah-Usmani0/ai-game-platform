import type { FeelPreset } from '@gg/sdk';

/**
 * Reachable (dx, dy) tile offsets for a jump or a fall under a feel preset, derived by
 * integrating the preset's own constants (held variable jump, air control, gravity, max fall).
 * dy < 0 is up. The envelope is intentionally generous (a superset of true reachability);
 * the playtest bots catch the false positives.
 */
export interface Envelope {
  /** Max tiles the player can rise with a held jump. */
  jumpUpTiles: number;
  /** For each dy in [-jumpUpTiles, maxDropTiles], the max |dx| in tiles reachable when landing at that dy. */
  maxDx: Map<number, number>;
  maxDropTiles: number;
}

export function jumpEnvelope(feel: FeelPreset, tileSize: number, maxDropTiles = 12): Envelope {
  const dt = 1 / 60;
  const vx = feel.maxRun + feel.jumpHBoost;
  let vy = feel.jumpSpeed;
  let y = 0;
  let x = 0;
  let t = 0;
  let minY = 0;
  const best = new Map<number, number>();
  const note = () => {
    const dy = Math.floor(y / tileSize + 1e-6);
    const dx = Math.floor(x / tileSize + 1e-6);
    best.set(dy, Math.max(best.get(dy) ?? 0, dx));
  };
  // Held variable jump keeps vy at jumpSpeed for varJumpTime; then gravity with the apex half-gravity window.
  while (t < 6) {
    if (t < feel.varJumpTime) vy = feel.jumpSpeed;
    else {
      const g = Math.abs(vy) < feel.halfGravThreshold ? feel.gravity * 0.5 : feel.gravity;
      vy = Math.min(vy + g * dt, feel.maxFall);
    }
    y += vy * dt;
    x += vx * dt;
    t += dt;
    minY = Math.min(minY, y);
    note();
    if (y / tileSize > maxDropTiles) break;
  }
  const jumpUpTiles = Math.max(0, Math.floor(-minY / tileSize));
  return { jumpUpTiles, maxDx: best, maxDropTiles };
}
