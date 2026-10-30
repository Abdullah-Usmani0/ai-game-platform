import { CropTable, LevelJson } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed } from '@gg/sdk';
import { levelTicksOf, runBot } from '@gg/template-core';
import { BOTS, validateFarm } from '@gg/template-lifesim/node';
import { describe, expect, it } from 'vitest';
import crops from '../content/crops.json';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';

describe('lifesim sample', () => {
  it('content validates against the schemas and the farm grammar', () => {
    expect(CropTable.parse(crops).crops.map((c) => c.id)).toEqual(['parsnip', 'kale', 'blueberry', 'sunflower']);
    for (const level of LEVELS) {
      LevelJson.parse(level);
      expect(validateFarm(level).issues, level.id).toEqual([]);
    }
  });

  it('the farmer makes every season quota with the sample crops, at the seed each season is played with', () => {
    for (const [i, level] of LEVELS.entries()) {
      const sim = createSim({ ...SIM_OPTIONS, level, seed: levelSeed(DEFAULT_SEED, i) });
      const r = runBot(sim, BOTS['farmer']!, levelTicksOf(SIM_OPTIONS));
      expect(r.completed, `${level.id}: ${String(sim.world.hud['gold'])} of ${String(sim.world.hud['quota'])}`).toBe(true);
      expect(r.events['feedback']).toBeGreaterThan(0);
      // It grew and sold the sample's own crops.
      expect(sim.events.history().some((e) => e.name === 'custom:harvest' && e.payload['crop'] !== 'parsnip')).toBe(true);
    }
  });

  it('a season left alone is lost when its days run out', () => {
    const sim = createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 });
    const r = runBot(sim, BOTS['afk']!, levelTicksOf(SIM_OPTIONS));
    expect(r.completed).toBe(false);
    expect(sim.world.flags.gameOver).toBe(true);
  });

  it('is deterministic', () => {
    const a = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 3 }), BOTS['chaos']!, 2400);
    const b = runBot(createSim({ ...SIM_OPTIONS, level: LEVELS[1]!, seed: 3 }), BOTS['chaos']!, 2400);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
