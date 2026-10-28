/** Balance sweep: solver (kiter) and afk outcomes across arena seeds and difficulties with default params. */
import { createSim } from '@gg/sdk';
import { runBot, simOptionsFor } from '@gg/template-core';
import { survivors } from '../src/node.js';
import { generateArena, generateWaves } from '../src/level/generate.js';

const systems = {
  version: 1 as const,
  genre: 'survivors' as const,
  feelPreset: survivors.defaultFeel,
  systems: survivors.requiredSystems.concat(survivors.optionalSystems).map((id) => ({ id, params: {} })),
};
const difficulties = (process.argv[2] ?? '0.15,0.25,0.35,0.5').split(',').map(Number);
const seeds = Number(process.argv[3] ?? 12);
for (const d of difficulties) {
  const waves = generateWaves({ seed: 1, difficulty: d }, 60);
  const opts = simOptionsFor(survivors, systems, { content: { waves } });
  let wins = 0;
  const detail: string[] = [];
  for (let s = 1; s <= seeds; s++) {
    const level = generateArena({ seed: s, difficulty: d });
    const kiter = runBot(createSim({ ...opts, level, seed: 1 }), survivors.bots[survivors.solverBot]!, 90 * 60);
    const afk = runBot(createSim({ ...opts, level, seed: 1 }), survivors.bots['afk']!, 90 * 60);
    if (kiter.completed) wins++;
    detail.push(`${s}:${kiter.completed ? 'W' : 'L' + Math.round(kiter.ticks / 60)}${afk.completed ? '!' : ''}`);
  }
  console.log(`d=${d} kiter wins ${wins}/${seeds}  ${detail.join(' ')}`);
}
