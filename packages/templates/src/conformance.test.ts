/**
 * Every catalog system does what its metadata says, and nothing else: the composition rules (one movement, one win, one
 * death owner per game) and the catalog shown to models are only as true as these declarations. Each genre is played by
 * all its bots on three generated levels, with every system wrapped so the events it causes, the entities it spawns and
 * the won and game-over flags it sets are put down to it. Fails on anything undeclared, and on a declared win that no
 * run ever reaches.
 */
import type { GameEventRecord } from '@gg/schemas';
import { createSim, type FeedbackBinding, type SimCtx, type SystemDef } from '@gg/sdk';
import { runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

interface Seen {
  emits: Set<string>;
  spawns: Set<string>;
  won: boolean;
  gameOver: boolean;
}

describe('systems do what their metadata says', () => {
  for (const g of Object.values(GENRES)) {
    it(`${g.id}`, () => {
      const seen = new Map<string, Seen>();
      const rec = (id: string): Seen => {
        let r = seen.get(id);
        if (!r) seen.set(id, (r = { emits: new Set(), spawns: new Set(), won: false, gameOver: false }));
        return r;
      };
      let current: string | null = null;
      // Runs one call of a system with what happens during it put down to the system.
      const attributed = (id: string, ctx: SimCtx, call: () => void) => {
        const before = { ...ctx.world.flags };
        current = id;
        try {
          call();
        } finally {
          current = null;
        }
        if (ctx.world.flags.won && !before.won) rec(id).won = true;
        if (ctx.world.flags.gameOver && !before.gameOver) rec(id).gameOver = true;
      };
      const wrap = (sys: SystemDef<unknown>): SystemDef<unknown> =>
        g.systems[sys.id]
          ? {
              ...sys,
              fixedUpdate: (state, input, ctx) => attributed(sys.id, ctx, () => sys.fixedUpdate(state, input, ctx)),
              onEvent: sys.onEvent ? (state, ev: GameEventRecord, ctx) => attributed(sys.id, ctx, () => sys.onEvent!(state, ev, ctx)) : undefined,
            }
          : sys;
      const wavesTypes = new Set<string>();
      for (const params of [{ seed: 1, difficulty: 0.3 }, { seed: 2, difficulty: 0.6 }, { seed: 3, difficulty: 0.55, boss: 1 }]) {
        const level = g.levelGrammar.generate(params);
        const content = g.extraContent?.(params) ?? {};
        for (const m of JSON.stringify(content['waves'] ?? null).matchAll(/"([a-z][a-z0-9_-]*)"/g)) wavesTypes.add(m[1]!);
        const feedback = [...g.gddDefaults.feedbackEvents, ...(g.feedbackExtras ?? [])] as FeedbackBinding[];
        const options = simOptionsFor(g, systemsJsonFor(g), { behaviours: g.defaultBehaviours, content, feedback });
        for (const bot of Object.values(g.bots)) {
          const sim = createSim({ ...options, systems: options.systems.map(wrap), level, seed: 1 });
          sim.events.on('*', (ev) => {
            if (!current) return;
            rec(current).emits.add(ev.name);
            if (ev.name === 'spawn') rec(current).spawns.add(String(ev.payload['type']));
          });
          runBot(sim, bot, 4000);
        }
      }
      for (const [id, r] of seen) {
        const meta = g.systems[id]!.meta;
        expect([...r.emits].filter((e) => !meta.emits.includes(e)), `${g.id}/${id} emits undeclared events`).toEqual([]);
        const spawns = meta.provides?.spawns ?? [];
        const allowed = (t: string) => spawns.includes(t) || (spawns.includes('waves') && wavesTypes.has(t));
        expect([...r.spawns].filter((t) => !allowed(t)), `${g.id}/${id} spawns undeclared types`).toEqual([]);
        if (r.won) expect(meta.provides?.win, `${g.id}/${id} wins the level without declaring a win`).toBeDefined();
        if (r.gameOver) expect(['game_over', 'lives'], `${g.id}/${id} ends the run without declaring it`).toContain(meta.provides?.death);
      }
      for (const [id, m] of Object.entries(g.systems)) {
        if (m.meta.provides?.win) expect(seen.get(id)?.won, `${g.id}/${id} declares a win no run reached`).toBe(true);
      }
    });
  }
});
