/**
 * A bot plays the game exactly as a person pressing the same keys would: every bot run of every genre, the random ones
 * included, replays from its input log alone on a fresh sim to the same final state. A bot that drew from the game's
 * rng, or changed the sim in any way but its inputs, would make the game play differently for it, and its runs (proofs,
 * metrics, recorded evidence) would not hold for players.
 */
import { createSim } from '@gg/sdk';
import { runBot, scriptFromLog, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

describe('bot runs replay from their inputs', () => {
  for (const g of Object.values(GENRES)) {
    it(`${g.id}: every bot`, () => {
      const params = { seed: 2, difficulty: 0.5 };
      const level = g.levelGrammar.generate(params);
      const options = { ...simOptionsFor(g, systemsJsonFor(g), { behaviours: g.defaultBehaviours, content: g.extraContent?.(params) ?? {} }), level, seed: 3 };
      for (const [name, bot] of Object.entries(g.bots)) {
        const sim = createSim(options);
        const r = runBot(sim, bot, 1200);
        const again = createSim(options);
        again.run(scriptFromLog(sim, sim.tick), sim.tick);
        expect(again.hash(), `${g.id}: ${name}`).toBe(r.finalHash);
      }
    });
  }
});
