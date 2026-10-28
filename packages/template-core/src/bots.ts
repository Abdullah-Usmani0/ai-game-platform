import type { InputSegment, Sim } from '@gg/sdk';
import type { BotPolicy, BotResult } from './manifest.js';

/** Run a bot policy over a sim for up to maxTicks; stops early on win or game over. */
export function runBot(sim: Sim, policy: BotPolicy, maxTicks: number): BotResult {
  const memory: Record<string, number> = {};
  let lastX = sim.world.player.x;
  let lastY = sim.world.player.y;
  let stuck = 0;
  let stuckMax = 0;
  for (let t = 0; t < maxTicks; t++) {
    sim.step(policy(sim, sim.tick, memory));
    const p = sim.world.player;
    if (Math.abs(p.x - lastX) < 0.01 && Math.abs(p.y - lastY) < 0.01 && p.alive) stuck++;
    else stuck = 0;
    stuckMax = Math.max(stuckMax, stuck);
    lastX = p.x;
    lastY = p.y;
    if (sim.world.flags.won || sim.world.flags.gameOver) break;
  }
  const events: Record<string, number> = {};
  for (const name of ['jump', 'land', 'hit', 'death', 'pickup', 'level_complete', 'feedback', 'audio_play', 'spawn']) events[name] = sim.events.count(name);
  return { completed: sim.world.flags.won, ticks: sim.tick, deaths: sim.world.deaths, stuckMaxTicks: stuckMax, finalHash: sim.hash(), events };
}

/** Convert a bot run into an input script (for replaying the same run in the browser). */
export function scriptFromLog(sim: Sim, endTick: number): InputSegment[] {
  const log = sim.inputLog();
  const out: InputSegment[] = [];
  for (let i = 0; i < log.length; i++) {
    const f = log[i]!;
    const next = log[i + 1];
    out.push({ from: f.tick, to: next ? next.tick : endTick, input: { ...f.input } });
  }
  return out;
}
