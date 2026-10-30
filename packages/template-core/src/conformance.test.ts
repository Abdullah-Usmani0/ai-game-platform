import { defineSystem, emptyInput, type SystemDef } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { conformance, type MechanicContract } from './conformance.js';
import type { BotPolicy } from './manifest.js';
import { CELESTE_CLASS } from '@gg/sdk';
import { finish, ROOM, walker } from './test-games.js';

/** A bell rung with the action key: each ring counts on the HUD and every third throws a spark. */
function bellWith(overrides: Partial<SystemDef<{ rings: number; prev: boolean }>> = {}) {
  return defineSystem<{ rings: number; prev: boolean }>({
    id: 'bell',
    init: () => ({ rings: 0, prev: false }),
    fixedUpdate(s, input, ctx) {
      if (input.action && !s.prev) {
        s.rings++;
        ctx.world.hud['rings'] = s.rings;
        ctx.emit('custom:ring', { n: s.rings });
        if (s.rings % 3 === 0) ctx.spawn('spark', ctx.world.player.x, ctx.world.player.y);
      }
      s.prev = input.action;
    },
    ...overrides,
  });
}

const CONTRACT: MechanicContract = { id: 'bell', controls: { action: 'ring the bell' }, provides: { spawns: ['spark'] }, emits: ['custom:ring', 'spawn'], hud: ['rings'] };

/** Walks the long way round to the goal (down, across the gap at the bottom, up), ringing the bell on the way. */
const walkRinging: BotPolicy = (sim, tick) => {
  const p = sim.world.player;
  const ts = sim.map.tileSize;
  const tx = Math.floor((p.x + p.w / 2) / ts);
  const ty = Math.floor((p.y + p.h / 2) / ts);
  const input = { ...emptyInput(), action: tick % 20 < 2 };
  if (tx < 10 && ty < 7) input.down = true;
  else if (tx < 14) input.right = true;
  else if (ty > 4) input.up = true;
  return input;
};
const idle: BotPolicy = () => emptyInput();

function check(systems: SystemDef<unknown>[], contracts: MechanicContract[] = [CONTRACT], bespoke = ['bell'], ticks = 900) {
  return conformance({
    options: { feel: CELESTE_CLASS, systems, entityDefs: [{ type: 'spark', w: 4, h: 4, gravity: false }], player: { w: 8, h: 8, hp: 1 }, movementMode: 'topdown' },
    levels: [{ level: ROOM, seed: 1 }],
    contracts,
    bespoke,
    bots: { walk: walkRinging, idle },
    ticks,
  });
}
/** The errors' codes: random keys can find the goal of the little test room, a warning every run here has. */
const codes = (r: ReturnType<typeof check>) => r.issues.filter((i) => i.severity === 'error').map((i) => `${i.severity}:${i.code}`);

describe('conformance of bespoke systems', () => {
  it('a system that keeps to its contract passes, and the game around it is checked as a whole', () => {
    const r = check([walker, finish, bellWith()]);
    expect(codes(r)).toEqual([]);
    expect(r.metrics).toMatchObject({ watched: 1, levels: 1 });
    // The test room's goal is a short walk away: random keys find it, which the check says.
    expect(r.issues.map((i) => `${i.severity}:${i.code}`)).toEqual(['warning:random_wins']);
    expect(r.metrics['randomWins']).toBeGreaterThan(0);
  });

  it('names each thing a system does that its contract leaves out', () => {
    const quiet: MechanicContract = { id: 'bell', controls: {}, emits: [], hud: [] };
    const r = check([walker, finish, bellWith()], [quiet]);
    expect(codes(r)).toEqual(['error:undeclared_emit', 'error:undeclared_spawn', 'error:undeclared_hud', 'error:undeclared_key']);
    expect(r.issues[0]!.message).toBe('bell emits custom:ring, spawn, which its contract does not name');
  });

  it('a system without a contract, and a contract without a system, are both errors', () => {
    expect(codes(check([walker, finish, bellWith()], []))).toEqual(['error:no_contract']);
    expect(codes(check([walker, finish], [CONTRACT], []))).toEqual(['error:contract_unused']);
  });

  it('a win or a game over the contract does not claim, a win with no progress, a type the game lacks', () => {
    const winner = bellWith({
      fixedUpdate(s, input, ctx) {
        if (input.action && !s.prev && ++s.rings >= 3) ctx.world.flags.won = true;
        s.prev = input.action;
      },
    });
    expect(codes(check([walker, winner], [{ ...CONTRACT, provides: {} }]))).toContain('error:undeclared_win');
    expect(codes(check([walker, winner], [{ ...CONTRACT, provides: { win: 'objectives' } }]))).toContain('error:no_progress');
    expect(codes(check([walker, { ...winner, progress: (s: { rings: number }) => s.rings / 3 }], [{ ...CONTRACT, provides: { win: 'objectives' } }]))).not.toContain('error:no_progress');
    const ender = bellWith({ fixedUpdate: (_s, input, ctx) => void (input.action && (ctx.world.flags.gameOver = true)) });
    expect(codes(check([walker, finish, ender]))).toContain('error:undeclared_game_over');
    const stranger = bellWith({ fixedUpdate: (_s, input, ctx) => void (input.action && ctx.spawn('ghost', 8, 8)) });
    const r = check([walker, finish, stranger], [{ ...CONTRACT, provides: { spawns: ['ghost'] } }]);
    expect(codes(r)).toContain('error:crash');
    expect(r.issues.find((i) => i.code === 'crash')!.message).toMatch(/^bell stopped the game on test at tick \d+ \(walk playing\): unknown entity type 'ghost'/);
  });

  it('state kept outside the state object breaks saving and loading, and leaks between two games', () => {
    // A ring count in a closure, not in the system's state: a save cannot hold it, and two games share it.
    const counter = { rings: 0 };
    const leaky = bellWith({
      init: () => ({ rings: 0, prev: false }),
      fixedUpdate(s, input, ctx) {
        if (input.action && !s.prev) counter.rings++;
        s.prev = input.action;
        // The count moves the player, so the drift shows in the world.
        if (counter.rings % 2 === 1) ctx.move(ctx.world.player, 0.5, 0);
      },
    });
    const r = check([walker, finish, leaky], [{ ...CONTRACT, provides: {}, emits: [], hud: [] }]);
    expect(codes(r)).toEqual(expect.arrayContaining(['error:save_load', 'error:shared_state']));
    // State that cannot be saved at all: a function in it.
    const unsaveable = defineSystem<{ f: () => number }>({ id: 'bell', init: () => ({ f: () => 1 }), fixedUpdate: () => {} });
    expect(codes(check([walker, finish, unsaveable as SystemDef<unknown>], [{ ...CONTRACT, emits: [], hud: [], controls: {} }]))).toContain('error:state_unsaveable');
  });

  it('standing still must not win; random keys winning is a warning; a slow system is named', () => {
    const free = bellWith({ fixedUpdate: (_s, _i, ctx) => void (ctx.tick > 30 && (ctx.world.flags.won = true)), progress: () => 0 });
    expect(codes(check([walker, free], [{ ...CONTRACT, provides: { win: 'objectives' }, controls: {}, emits: [], hud: [] }]))).toContain('error:afk_wins');
    const slow = bellWith({
      fixedUpdate(s, input) {
        const t0 = performance.now();
        while (performance.now() - t0 < 1.2) s.rings += input.action ? 0 : 0;
      },
    });
    expect(codes(check([walker, finish, slow], [{ ...CONTRACT, provides: {}, emits: [], hud: [] }], ['bell'], 60))).toContain('error:slow');
  });
});
