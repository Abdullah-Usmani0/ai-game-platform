import { centerX, centerY, emptyInput, type Entity, type InputState, type Sim } from '@gg/sdk';
import { botRandom, type BotPolicy } from '@gg/template-core';

const hostile = (e: Entity) => !e.isPlayer && e.alive && e.contactDamage > 0 && !e.isProjectile;

function press(input: InputState, dx: number, dy: number, dead = 1): void {
  if (dx > dead) input.right = true;
  else if (dx < -dead) input.left = true;
  if (dy > dead) input.down = true;
  else if (dy < -dead) input.up = true;
}

/**
 * Dodger: the solver. Holds fire and, every tick, scores nine candidate moves (left/stay/right x up/stay/down)
 * by extrapolating the ship and every bullet and hostile half a second ahead: the candidate with the largest
 * clearance wins, ties broken by sliding under the nearest hostile and staying low. A dash fires when no
 * candidate stays clear.
 */
export const dodger: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  const p = sim.world.player;
  if (!p.alive) return input;
  input.action = true;
  const map = sim.map;
  const ts = map.tileSize;
  const px = centerX(p);
  const py = centerY(p);
  const minX = ts * 1.5 + p.w / 2;
  const maxX = map.pixelWidth - ts * 1.5 - p.w / 2;
  const minY = map.pixelHeight * 0.5;
  const maxY = map.pixelHeight - ts * 1.5 - p.h / 2;
  const homeY = map.pixelHeight - ts * 4;
  const SPEED = 125;
  const threats = sim.world.entities.filter((e) => !e.isPlayer && e.alive && !e.pickup && e.contactDamage > 0);
  let targetX = map.pixelWidth / 2;
  let best = Infinity;
  for (const e of sim.world.entities) {
    if (!hostile(e)) continue;
    const d = Math.abs(centerX(e) - px) + Math.max(0, centerY(e) - py) * 4;
    if (d < best) {
      best = d;
      targetX = centerX(e);
    }
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const evaluate = (vx: number, vy: number): number => {
    let worst = 99;
    for (let k = 2; k <= 30; k += 2) {
      const t = k / 60;
      const sx = clamp(px + vx * SPEED * t, minX, maxX);
      const sy = clamp(py + vy * SPEED * 0.6 * t, minY, maxY);
      for (const e of threats) {
        const ex = centerX(e) + e.vx * t;
        const ey = centerY(e) + e.vy * t;
        const d = Math.max(Math.abs(ex - sx) - (e.w + p.w) / 2, Math.abs(ey - sy) - (e.h + p.h) / 2);
        if (d < worst) worst = d;
      }
    }
    const endX = clamp(px + vx * SPEED * 0.5, minX, maxX);
    const endY = clamp(py + vy * SPEED * 0.3, minY, maxY);
    return Math.min(worst, 24) - 0.03 * Math.abs(endX - targetX) - 0.02 * Math.abs(endY - homeY);
  };
  let bestScore = -Infinity;
  let bestVx = 0;
  let bestVy = 0;
  let bestClear = -99;
  for (const vx of [-1, 0, 1]) {
    for (const vy of [-1, 0, 1]) {
      const score = evaluate(vx, vy);
      if (score > bestScore) {
        bestScore = score;
        bestVx = vx;
        bestVy = vy;
        bestClear = score + 0.03 * Math.abs(clamp(px + vx * SPEED * 0.5, minX, maxX) - targetX) + 0.02 * Math.abs(clamp(py + vy * SPEED * 0.3, minY, maxY) - homeY);
      }
    }
  }
  press(input, bestVx * 10, bestVy * 10, 0.5);
  if (bestClear < 1 && tick - (mem['lastDash'] ?? -100) > 45 && bestVx !== 0) {
    input.dash = true;
    mem['lastDash'] = tick;
  }
  return input;
};

export const afk: BotPolicy = () => emptyInput();

export const chaos: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  if (tick % 12 === 0) {
    const rnd = botRandom(sim, mem);
    mem['dx'] = rnd.int(3) - 1;
    mem['dy'] = rnd.int(3) - 1;
  }
  if ((mem['dx'] ?? 0) > 0) input.right = true;
  if ((mem['dx'] ?? 0) < 0) input.left = true;
  if ((mem['dy'] ?? 0) > 0) input.down = true;
  if ((mem['dy'] ?? 0) < 0) input.up = true;
  input.action = tick % 3 !== 0;
  if (tick % 71 === 0) input.dash = true;
  return input;
};

export const BOTS: Record<string, BotPolicy> = { dodger, afk, chaos };
