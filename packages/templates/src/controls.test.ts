/**
 * Every catalog system declares the keys it reads (CatalogSystem.controls): the play page lists them, and the explorer
 * leaves alone the keys that undo or restart. This probe plays each genre, and each freeform example game, with all its
 * bots while an input proxy records which keys every system reads, and fails on any key a system reads without
 * declaring, or uses with the parameters the game gives it and never reads.
 */
import type { SystemsJson } from '@gg/schemas';
import type { InputState } from '@gg/sdk';
import { createSim, type SystemDef } from '@gg/sdk';
import { runBot, simOptionsFor, systemsJsonFor, type GenreManifest } from '@gg/template-core';
import { EXAMPLES, freeformManifest } from '@gg/template-freeform/node';
import { controlsInUse } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

function probeKeys(g: GenreManifest, systems: Pick<SystemsJson, 'feelPreset' | 'systems'>, content: (params: { seed: number; difficulty: number }) => Record<string, unknown>): void {
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
    const options = simOptionsFor(g, systems, { behaviours: g.defaultBehaviours, content: content(params) });
    for (const bot of Object.values(g.bots)) runBot(createSim({ ...options, systems: options.systems.map(probe), level, seed: 1 }), bot, 1500);
  }
  // Keys a system takes over do nothing in the game (a runner's left and right): no system needs to read them.
  const taken = new Set<string>(Object.values(g.systems).flatMap((m) => m.meta.takesOver ?? []));
  for (const [id, keys] of read) {
    const meta = g.systems[id]?.meta;
    // A key a parameter switches off may still be read (to no effect); every key in use must be.
    const declared = Object.keys(meta?.controls ?? {});
    const inUse = meta ? Object.keys(controlsInUse(meta, systems.systems.find((s) => s.id === id)?.params)).filter((k) => !taken.has(k)) : [];
    expect([...keys].filter((k) => !declared.includes(k)), `${g.id}: ${id} reads undeclared keys`).toEqual([]);
    expect(inUse.filter((k) => !keys.has(k)), `${g.id}: ${id} declares keys it never reads`).toEqual([]);
  }
}

describe('system controls', () => {
  for (const g of Object.values(GENRES)) {
    it(`${g.id}: each system declares exactly the keys it reads`, () => {
      probeKeys(g, systemsJsonFor(g), (params) => g.extraContent?.(params) ?? {});
    });
  }
  for (const ex of EXAMPLES) {
    it(`freeform ${ex.id}: each system declares exactly the keys it reads with the game's parameters`, () => {
      const g = freeformManifest(ex.systems, ex.roster);
      probeKeys(g, ex.systems, (params) => ({ ...(g.extraContent?.(params) ?? {}), ...(ex.objectives ? { objectives: ex.objectives } : {}), ...ex.content }));
    });
  }
});
