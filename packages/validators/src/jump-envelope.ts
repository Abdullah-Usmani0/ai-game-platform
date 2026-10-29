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

/** Movement abilities the envelope may assume (ability-gated genres); the default is a plain held jump. */
export interface EnvelopeOptions {
  /** Air jumps available after leaving the ground (a double jump is 1). Each fires at the apex of the previous jump. */
  airJumps?: number;
  /** One dash per airtime (dashSpeed for dashTime with gravity off), tried at the apex and twice on the way down. */
  dash?: boolean;
  /**
   * Model horizontal air speed as the movement code does (take-off at maxRun + jumpHBoost, then reduced toward
   * maxRun at runReduce * airMult) instead of the generous constant take-off speed, and credit one tile of slack for
   * landing with the body half over a ledge. Ability gates sized against the real physics need this; it is still a
   * superset of what a player can do from a running start.
   */
  exactAir?: boolean;
}

const DT = 1 / 60;

/** One trajectory: a held jump, `airJumps` more jumps at each apex, optionally a dash `dashDelay` seconds after the last apex. */
function trace(feel: FeelPreset, tileSize: number, maxDropTiles: number, airJumps: number, dashDelay: number | null, exactAir: boolean, best: Map<number, number>): number {
  const slack = exactAir ? 1 : 0;
  let vx = feel.maxRun + feel.jumpHBoost;
  let vy = feel.jumpSpeed;
  let y = 0;
  let x = 0;
  let t = 0;
  let jumpT = 0;
  let minY = 0;
  let jumpsLeft = airJumps;
  let apexAt = -1;
  let dashTicks = 0;
  let dashed = dashDelay === null;
  const note = () => {
    const dy = Math.floor(y / tileSize + 1e-6);
    const dx = Math.floor(x / tileSize + 1e-6) + slack;
    best.set(dy, Math.max(best.get(dy) ?? 0, dx));
  };
  // Held variable jump keeps vy at jumpSpeed for varJumpTime; then gravity with the apex half-gravity window.
  while (t < 6) {
    if (dashTicks > 0) {
      dashTicks--;
      vy = 0;
      vx = feel.dashSpeed;
    } else {
      if (jumpT < feel.varJumpTime) vy = feel.jumpSpeed;
      else {
        const g = Math.abs(vy) < feel.halfGravThreshold ? feel.gravity * 0.5 : feel.gravity;
        vy = Math.min(vy + g * DT, feel.maxFall);
      }
      if (vy >= 0 && jumpT >= feel.varJumpTime) {
        if (jumpsLeft > 0) {
          // Air jump at the apex: a fresh held jump.
          jumpsLeft--;
          jumpT = 0;
          vy = feel.jumpSpeed;
        } else if (apexAt < 0) apexAt = t;
      }
      if (!dashed && apexAt >= 0 && dashDelay !== null && t >= apexAt + dashDelay) {
        dashed = true;
        dashTicks = Math.max(1, Math.round(feel.dashTime * 60));
        vy = 0;
        vx = feel.dashSpeed;
      }
      // Air control: over-speed is reduced toward maxRun (the movement code's runReduce * airMult).
      if (exactAir && vx > feel.maxRun) vx = Math.max(feel.maxRun, vx - feel.runReduce * feel.airMult * DT);
    }
    y += vy * DT;
    x += vx * DT;
    t += DT;
    jumpT += DT;
    minY = Math.min(minY, y);
    note();
    if (y / tileSize > maxDropTiles) break;
  }
  return minY;
}

export function jumpEnvelope(feel: FeelPreset, tileSize: number, maxDropTiles = 12, opts: EnvelopeOptions = {}): Envelope {
  const best = new Map<number, number>();
  let minY = 0;
  const dashDelays: Array<number | null> = opts.dash ? [null, 0, 0.1, 0.2] : [null];
  for (let jumps = 0; jumps <= Math.max(0, opts.airJumps ?? 0); jumps++) {
    for (const delay of dashDelays) minY = Math.min(minY, trace(feel, tileSize, maxDropTiles, jumps, delay, opts.exactAir ?? false, best));
  }
  const jumpUpTiles = Math.max(0, Math.floor(-minY / tileSize));
  return { jumpUpTiles, maxDx: best, maxDropTiles };
}
