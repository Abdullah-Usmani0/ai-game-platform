import { emptyInput, type InputState, type Sim } from '@gg/sdk';
import { botRandom, type BotPolicy } from '@gg/template-core';

/**
 * Kiter: a potential field. Every nearby enemy repels (1/d^2), the arena centre attracts (strongly near walls),
 * and the bot idles when the nearest enemy is inside attack range but not touching, so auto-attack can work.
 */
export const kiter: BotPolicy = (sim: Sim) => {
  const p = sim.world.player;
  const input: InputState = emptyInput();
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  let rx = 0;
  let ry = 0;
  let nearest = Infinity;
  for (const e of sim.world.entities) {
    if (e.isPlayer || !e.alive || e.contactDamage <= 0) continue;
    const dx = px - (e.x + e.w / 2);
    const dy = py - (e.y + e.h / 2);
    const d = Math.hypot(dx, dy) || 1;
    nearest = Math.min(nearest, d);
    if (d < 90) {
      rx += (dx / d) / (d * d);
      ry += (dy / d) / (d * d);
    }
  }
  const cx = sim.map.pixelWidth / 2 - px;
  const cy = sim.map.pixelHeight / 2 - py;
  const cl = Math.hypot(cx, cy) || 1;
  const wallDist = Math.min(px, py, sim.map.pixelWidth - px, sim.map.pixelHeight - py);
  const centreWeight = wallDist < 48 ? 1.2 : 0.25;
  let vx: number;
  let vy: number;
  if (nearest < 26) {
    const rl = Math.hypot(rx, ry) || 1;
    vx = rx / rl + (cx / cl) * centreWeight;
    vy = ry / rl + (cy / cl) * centreWeight;
  } else if (nearest < 36) {
    vx = (cx / cl) * (wallDist < 48 ? 1 : 0);
    vy = (cy / cl) * (wallDist < 48 ? 1 : 0);
  } else {
    vx = cx / cl;
    vy = cy / cl;
  }
  if (vx > 0.3) input.right = true;
  else if (vx < -0.3) input.left = true;
  if (vy > 0.3) input.down = true;
  else if (vy < -0.3) input.up = true;
  return input;
};

export const afk: BotPolicy = () => emptyInput();

export const chaos: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  if (tick % 15 === 0) {
    const rnd = botRandom(sim, mem);
    mem['dx'] = rnd.int(3) - 1;
    mem['dy'] = rnd.int(3) - 1;
  }
  if ((mem['dx'] ?? 0) > 0) input.right = true;
  if ((mem['dx'] ?? 0) < 0) input.left = true;
  if ((mem['dy'] ?? 0) > 0) input.down = true;
  if ((mem['dy'] ?? 0) < 0) input.up = true;
  if (tick % 41 === 0) input.dash = true;
  return input;
};

export const BOTS: Record<string, BotPolicy> = { kiter, afk, chaos };
