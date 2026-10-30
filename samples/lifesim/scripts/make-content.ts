// Regenerates the sample's three seasons from the farm grammar: spring, summer and autumn on bigger fields. A seed is kept
// only when the farm validates and the farmer bot makes the season's quota in the real sim, with the sample's own
// crops, at the seed the season is played with (the gate's own oracle).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelProof } from '@gg/schemas';
import { compactScript, createSim, DEFAULT_SEED, levelSeed } from '@gg/sdk';
import { levelTicksOf, runBot, scriptFromLog } from '@gg/template-core';
import { BOTS, generateFarm, validateFarm } from '@gg/template-lifesim/node';
import { SIM_OPTIONS } from '../src/game.js';

const dir = fileURLToPath(new URL('../content/levels/', import.meta.url));
// The first season's winning run is kept too: the web's genre card replays it to a busy morning.
const proofs = fileURLToPath(new URL('../content/proofs/', import.meta.url));
mkdirSync(proofs, { recursive: true });
const plan = [
  { file: 'L01-spring.json', id: 'spring', name: 'Spring', difficulty: 0.3, from: 5 },
  { file: 'L02-summer.json', id: 'summer', name: 'Summer', difficulty: 0.5, from: 17 },
  { file: 'L03-autumn.json', id: 'autumn', name: 'Autumn', difficulty: 0.75, from: 29 },
];
for (const [i, p] of plan.entries()) {
  let chosen = null;
  for (let seed = p.from; seed < p.from + 20 && !chosen; seed++) {
    const level = { ...generateFarm({ seed, difficulty: p.difficulty }), id: p.id, name: p.name, ramp: { segment: i, difficulty: p.difficulty } };
    const r = validateFarm(level);
    if (!r.ok) continue;
    const sim = createSim({ ...SIM_OPTIONS, level, seed: levelSeed(DEFAULT_SEED, i) });
    const run = runBot(sim, BOTS['farmer']!, levelTicksOf(SIM_OPTIONS));
    console.log(`${p.id} seed ${seed}: ${r.metrics['plots']} plots, quota ${String(sim.world.hud['quota'])}, farmer ${run.completed ? `made it on day ${String(sim.world.hud['day'])} in ${run.ticks} ticks` : 'fell short'}`);
    if (run.completed) {
      chosen = level;
      if (i > 0) continue;
      const proof: LevelProof = { version: 1, level: p.id, seed: levelSeed(DEFAULT_SEED, i), ticks: sim.tick, by: 'solver', script: compactScript(scriptFromLog(sim, sim.tick)) };
      writeFileSync(`${proofs}${p.id}.json`, JSON.stringify(proof) + '\n');
    }
  }
  if (!chosen) throw new Error(`no seed worked for ${p.id}`);
  writeFileSync(`${dir}${p.file}`, JSON.stringify(chosen, null, 2) + '\n');
}
console.log(`wrote ${plan.map((p) => p.file).join(', ')}`);
