/**
 * Every catalog system declares the keys it reads (CatalogSystem.controls): the play page lists them, and the explorer
 * leaves alone the keys that undo or restart. This probe plays each genre with all its bots while an input proxy
 * records which keys every system reads, and fails on any key a system reads without declaring, or declares unread.
 */
import type { InputState } from '@gg/sdk';
import { createSim, type SystemDef } from '@gg/sdk';
import { runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

describe('system controls', () => {
  for (const g of Object.values(GENRES)) {
    it(`${g.id}: each system declares exactly the keys it reads`, () => {
      const read = new Map<string, Set<string>>();
      const probe = (sys: SystemDef<unknown>): SystemDef<unknown> => ({
        ...sys,
        fixedUpdate(state, input, ctx) {
          let keys = read.get(sys.id);
          if (!keys) read.set(sys.id, (keys = new Set()));
          const seen = keys;
          const spy = new Proxy(input, {
            get(t, k, r) {
              if (typeof k === 'string') seen.add(k);
              return Reflect.get(t, k, r) as unknown;
            },
          });
          sys.fixedUpdate(state, spy as InputState, ctx);
        },
      });
      for (const params of [{ seed: 1, difficulty: 0.3 }, { seed: 2, difficulty: 0.6 }]) {
        const level = g.levelGrammar.generate(params);
        const options = simOptionsFor(g, systemsJsonFor(g), { behaviours: g.defaultBehaviours, content: g.extraContent?.(params) ?? {} });
        for (const bot of Object.values(g.bots)) runBot(createSim({ ...options, systems: options.systems.map(probe), level, seed: 1 }), bot, 1500);
      }
      for (const [id, keys] of read) {
        const declared = Object.keys(g.systems[id]?.meta.controls ?? {}).sort();
        expect([...keys].sort(), `${g.id}: ${id}`).toEqual(declared);
      }
    });
  }
});
