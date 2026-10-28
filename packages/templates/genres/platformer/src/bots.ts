import { emptyInput, type InputState, type Sim } from '@gg/sdk';
import type { BotPolicy } from '@gg/template-core';

/** Greedy runner: hold right; hold jump for 12 ticks when blocked or when a pit or hazard is ahead. */
export const walker: BotPolicy = (sim: Sim, _tick, mem) => {
  const p = sim.world.player;
  const input: InputState = { ...emptyInput(), right: true };
  const aheadX = p.x + p.w + 6;
  const below = sim.map.kindAtPx(aheadX, p.y + p.h + 2);
  const pitAhead = below === 'air' || below === 'hazard';
  const hazardAhead = sim.map.kindAtPx(aheadX, p.y + p.h - 1) === 'hazard';
  if ((mem['hold'] ?? 0) === 0 && p.grounded && (p.hitWall || pitAhead || hazardAhead)) mem['hold'] = 12;
  if ((mem['hold'] ?? 0) > 0) {
    input.jump = true;
    mem['hold'] = (mem['hold'] ?? 0) - 1;
  }
  return input;
};

/** Coverage explorer: random direction changes every ~20 ticks, random jumps and dashes. */
export const chaos: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  if (tick % 20 === 0) mem['dir'] = sim.rng.int(3) - 1;
  const dir = mem['dir'] ?? 1;
  if (dir > 0) input.right = true;
  if (dir < 0) input.left = true;
  if (tick % 7 === 0 && sim.rng.chance(0.5)) mem['jumpUntil'] = tick + 10;
  if ((mem['jumpUntil'] ?? 0) > tick) input.jump = true;
  if (tick % 53 === 0) input.dash = true;
  return input;
};

export const BOTS: Record<string, BotPolicy> = { walker, chaos };
