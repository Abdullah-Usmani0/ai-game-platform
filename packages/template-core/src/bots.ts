import { emptyInput, MENU_GRACE_TICKS, type InputSegment, type InputState, type Sim } from '@gg/sdk';
import type { BotPolicy, BotResult } from './manifest.js';

/** Input that takes a menu's highlighted option: action on alternate ticks once the menu's grace period is over. */
export function pickHighlighted(sim: Sim): InputState {
  const menu = sim.world.menu;
  return { ...emptyInput(), action: menu !== null && sim.tick - menu.openedTick >= MENU_GRACE_TICKS && sim.tick % 2 === 0 };
}

/** Run a bot policy over a sim for up to maxTicks; stops early on win or game over (once no menu is open). */
export function runBot(sim: Sim, policy: BotPolicy, maxTicks: number): BotResult {
  const memory: Record<string, number> = {};
  let lastX = sim.world.player.x;
  let lastY = sim.world.player.y;
  let stuck = 0;
  let stuckMax = 0;
  for (let t = 0; t < maxTicks; t++) {
    const menu = sim.world.menu;
    sim.step(menu && !policy.menus ? pickHighlighted(sim) : policy(sim, sim.tick, memory));
    const p = sim.world.player;
    // A menu holds the player still on purpose: that is never being stuck.
    if (Math.abs(p.x - lastX) < 0.01 && Math.abs(p.y - lastY) < 0.01 && p.alive && !menu && !sim.world.menu) stuck++;
    else stuck = 0;
    stuckMax = Math.max(stuckMax, stuck);
    lastX = p.x;
    lastY = p.y;
    if ((sim.world.flags.won || sim.world.flags.gameOver) && !sim.world.menu) break;
  }
  const events: Record<string, number> = {};
  for (const name of ['jump', 'land', 'hit', 'death', 'pickup', 'level_complete', 'feedback', 'audio_play', 'spawn', 'menu_open', 'menu_choose']) events[name] = sim.events.count(name);
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

/**
 * A bot's own random numbers, kept in its memory and seeded from the game's seed. Bots never draw from the game's rng
 * (sim.rng): that would change what the game does next (where waves spawn, which boons are offered), so the game would
 * play differently for the bot than for a person pressing the same keys, and the bot's input log would not replay.
 */
export function botRandom(sim: Sim, mem: Record<string, number>): { int(n: number): number; chance(p: number): boolean } {
  const next = (): number => {
    // mulberry32 over a 32-bit state in mem['_rng'].
    const a = ((mem['_rng'] ?? Math.imul(sim.rng.seed | 0, 0x9e3779b1) ^ 0x2545f491) + 0x6d2b79f5) | 0;
    mem['_rng'] = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (n) => Math.floor(next() * n), chance: (p) => next() < p };
}
