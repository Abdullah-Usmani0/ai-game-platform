/**
 * The universal explorer on real generated levels: given nothing but a genre's systems and what they declare about their
 * controls, it finishes an easy level of every action genre, and its script wins again on a fresh sim. The levels are
 * fixed (seed and difficulty) so the runs are exact; scripts/explore-sweep.ts measures the explorer more widely.
 */
import { createSim } from '@gg/sdk';
import { explore, explorerOptionsFor, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

const CASES = [
  { genre: 'platformer', seed: 2, budget: 20_000 },
  { genre: 'topdown-action', seed: 2, budget: 20_000 },
  { genre: 'survivors', seed: 2, budget: 20_000 },
  { genre: 'shmup', seed: 1, budget: 20_000 },
  // Ability gates (find the relic, then the way it opens) make the longest search.
  { genre: 'metroidvania', seed: 2, budget: 40_000 },
];

describe('explorer on curated genres', () => {
  for (const c of CASES) {
    it(`${c.genre}: finishes a generated level (seed ${c.seed}, difficulty 0.2) knowing nothing of the genre`, () => {
      const g = GENRES[c.genre]!;
      const params = { seed: c.seed, difficulty: 0.2 };
      const level = g.levelGrammar.generate(params);
      expect(g.levelGrammar.validate(level, g.feelPresets[g.defaultFeel]!).ok).toBe(true);
      const options = simOptionsFor(g, systemsJsonFor(g), { behaviours: g.defaultBehaviours, content: g.extraContent?.(params) ?? {} });
      const make = () => createSim({ ...options, level, seed: 1 });
      const r = explore(make, { budget: c.budget, ...explorerOptionsFor(Object.values(g.systems).map((m) => m.meta)) });
      expect(r.completed, JSON.stringify(r.best)).toBe(true);
      const again = make();
      again.run(r.script!, r.ticks);
      expect(again.world.flags.won).toBe(true);
    });
  }
});
