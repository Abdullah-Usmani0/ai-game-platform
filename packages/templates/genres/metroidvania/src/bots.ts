import { centerX, centerY, emptyInput, type Sim } from '@gg/sdk';
import type { BotPolicy } from '@gg/template-core';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP } from '@gg/template-platformer';
import { platformerCheck } from '@gg/template-platformer/check';
import { reachableTiles } from '@gg/validators';
import { DOOR_TYPE, KEY_TYPE, RELIC_ABILITY } from './entities.js';
import { doorDistance, envelopeFor, relicDistance, tallTiles } from './level/progress.js';

interface Plan {
  sig: string;
  kind: 'relic' | 'door' | 'goal';
  tx: number;
  ty: number;
}

/** The current target per sim; re-planned when abilities, keys, relics or doors change (once the player stands). */
const plans = new WeakMap<Sim, Plan>();

function tileOf(sim: Sim, e: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  const ts = sim.map.tileSize;
  return { x: Math.floor(centerX(e) / ts), y: Math.floor((e.y + e.h - 0.5) / ts) };
}

function signature(sim: Sim): string {
  const p = sim.world.player;
  const live = sim.world.entities.filter((e) => e.alive && (RELIC_ABILITY[e.type] !== undefined || e.type === KEY_TYPE || e.type === DOOR_TYPE)).map((e) => e.id);
  return `${sim.world.levelId}|${p.flags[ABILITY_DOUBLE_JUMP] === true ? 1 : 0}${p.flags[ABILITY_DASH] === true ? 1 : 0}|${String(sim.world.hud['keys'] ?? 0)}|${live.join(',')}`;
}

/** Nearest reachable relic; else the nearest reachable door while holding a key; else the goal. */
function choose(sim: Sim, sig: string): Plan {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const env = envelopeFor(sim.options.feel, ts, { doubleJump: p.flags[ABILITY_DOUBLE_JUMP] === true, dash: p.flags[ABILITY_DASH] === true });
  const dist = reachableTiles(sim.map, tileOf(sim, p), env, tallTiles(ts));
  const keys = Number(sim.world.hud['keys'] ?? 0);
  let best: Plan | null = null;
  let bestD = Infinity;
  for (const e of sim.world.entities) {
    if (!e.alive || (RELIC_ABILITY[e.type] === undefined && e.type !== KEY_TYPE)) continue;
    const t = tileOf(sim, e);
    const d = relicDistance(dist, t.x, t.y, env);
    if (d !== null && d < bestD) {
      bestD = d;
      best = { sig, kind: 'relic', tx: t.x, ty: t.y };
    }
  }
  if (!best && keys > 0) {
    for (const e of sim.world.entities) {
      if (!e.alive || e.type !== DOOR_TYPE) continue;
      const t = tileOf(sim, e);
      const d = doorDistance(dist, t);
      if (d !== null && d < bestD) {
        bestD = d;
        best = { sig, kind: 'door', tx: t.x, ty: t.y };
      }
    }
  }
  const goal = sim.options.level.goal;
  return best ?? { sig, kind: 'goal', tx: goal.x, ty: goal.y };
}

/** Tiles of missing ground ahead at the walking level, up to 30 (for deciding whether a pit needs the air abilities). */
function pitWidth(sim: Sim, fromPx: number, feetPx: number, facing: number): number {
  const ts = sim.map.tileSize;
  const ty = Math.floor((feetPx + 2) / ts);
  const tx0 = Math.floor(fromPx / ts);
  for (let k = 0; k < 30; k++) {
    const kind = sim.map.kindAt(tx0 + k * facing, ty);
    if (kind === 'solid' || kind === 'oneway') return k;
  }
  return 30;
}

/**
 * Progression solver: walks to its planned target with the platformer walker's jump rules, double-jumps at the apex
 * when a wall is still ahead, the target is still above or a wide pit is under it, and dashes at the next apex over a
 * wide pit. Jumps at enemies ahead. A stall of 1.5 s triggers a short reverse-and-jump escape.
 */
export const seeker: BotPolicy = (sim, tick, mem) => {
  const p = sim.world.player;
  const input = emptyInput();
  if (!p.alive) {
    mem['hold'] = 0;
    return input;
  }
  const ts = sim.map.tileSize;
  const sig = signature(sim);
  let plan = plans.get(sim);
  if (!plan || (plan.sig !== sig && p.grounded)) {
    plan = choose(sim, sig);
    plans.set(sim, plan);
  }
  if (p.grounded) {
    mem['airJumped'] = 0;
    mem['airDashed'] = 0;
  }
  const hasDouble = p.flags[ABILITY_DOUBLE_JUMP] === true;
  const hasDash = p.flags[ABILITY_DASH] === true;
  const cx = centerX(p);
  const dxPx = plan.tx * ts + ts / 2 - cx;

  // Stall breaker: standing still on the ground for 90 ticks reverses for 24 ticks with a jump.
  if (p.grounded && Math.abs(p.x - (mem['lastX'] ?? -1)) < 0.5) mem['still'] = (mem['still'] ?? 0) + 1;
  else mem['still'] = 0;
  mem['lastX'] = p.x;
  if ((mem['still'] ?? 0) > 90) {
    mem['still'] = 0;
    mem['escapeUntil'] = tick + 24;
    mem['escapeDir'] = dxPx >= 0 ? -1 : 1;
    mem['hold'] = 14;
  }
  let dir = Math.abs(dxPx) > 2 ? Math.sign(dxPx) : 0;
  if ((mem['escapeUntil'] ?? 0) > tick) dir = mem['escapeDir'] ?? -1;
  if (dir > 0) input.right = true;
  else if (dir < 0) input.left = true;

  const facing = dir !== 0 ? dir : p.facing;
  const feet = p.y + p.h;
  const front = facing > 0 ? p.x + p.w + 1 : p.x - 1;
  const ahead = facing > 0 ? p.x + p.w + 6 : p.x - 6;
  const solid = (px: number, py: number) => sim.map.kindAtPx(px, py) === 'solid';
  const wallAhead = dir !== 0 && (solid(front, feet - 1) || solid(front, p.y + 1));
  const below = sim.map.kindAtPx(ahead, feet + 2);
  const pitAhead = dir !== 0 && (below === 'air' || below === 'hazard');
  const hazardAhead = dir !== 0 && sim.map.kindAtPx(ahead, feet - 1) === 'hazard';
  const targetAbove = plan.ty * ts + ts <= feet - 4 && Math.abs(dxPx) < ts * 3;
  const enemyAhead = sim.world.entities.some((e) => e.alive && !e.isPlayer && e.contactDamage > 0 && !e.isProjectile && Math.abs(centerY(e) - centerY(p)) < 12 && (centerX(e) - cx) * facing > 0 && Math.abs(centerX(e) - cx) < 22);

  // A new jump needs the button released for at least one tick, or the game sees no fresh press.
  const released = (mem['hold'] ?? 0) === 0 && mem['jumpPrev'] !== 1;
  if (p.grounded && released && (wallAhead || pitAhead || hazardAhead || targetAbove || enemyAhead)) {
    // Hold through the apex float (half gravity needs the button held), then release so an air jump is a fresh press.
    mem['hold'] = 20;
    mem['wide'] = pitAhead && pitWidth(sim, ahead, feet, facing) >= 6 ? 1 : 0;
  }
  if (!p.grounded && released && p.vy >= -12) {
    const wide = mem['wide'] === 1;
    if (hasDouble && mem['airJumped'] !== 1 && (wallAhead || targetAbove || wide)) {
      mem['airJumped'] = 1;
      mem['hold'] = 20;
    } else if (hasDash && mem['airDashed'] !== 1 && wide && (mem['airJumped'] === 1 || !hasDouble)) {
      mem['airDashed'] = 1;
      input.dash = true;
    }
  }
  if ((mem['hold'] ?? 0) > 0) {
    input.jump = true;
    mem['hold'] = (mem['hold'] ?? 0) - 1;
  }
  mem['jumpPrev'] = input.jump ? 1 : 0;
  return input;
};

export const BOTS: Record<string, BotPolicy> = {
  seeker,
  // The platformer's greedy walker holds right and never backtracks for a relic: gated levels must stop it.
  walker: platformerCheck.bots['walker']!,
  chaos: platformerCheck.bots['chaos']!,
};
