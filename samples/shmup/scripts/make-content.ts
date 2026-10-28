// Regenerates the sample's sky, waves and behaviours; keeps the first wave difficulty the dodger survives on sim seed 1.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS, DRIFT, DRONE, TANK, generateSky, generateWaves, shmup } from '@gg/template-shmup/node';

const dir = fileURLToPath(new URL('../content/', import.meta.url));
const level = { ...generateSky({ seed: 1, difficulty: 0.3 }), id: 'sky', name: 'Static Sky' };
let chosen = null;
for (const difficulty of [0.3, 0.25, 0.2]) {
  const waves = generateWaves({ seed: 1, difficulty }, 60);
  const sim = createSim({ level, feel: shmup.feelPresets[shmup.defaultFeel]!, seed: 1, systems: Object.values(shmup.systems).map((m) => m.create()), entityDefs: shmup.entityDefs, player: shmup.player, behaviours: [DRONE, TANK, DRIFT], params: {}, content: { waves }, movementMode: 'topdown' });
  const r = runBot(sim, BOTS['dodger']!, 61 * 60);
  console.log(`difficulty ${difficulty}: ${r.completed ? `ok (kills ${r.events['death']})` : `died at ${Math.round(r.ticks / 60)} s`}`);
  if (r.completed) {
    chosen = waves;
    break;
  }
}
if (!chosen) throw new Error('no wave difficulty survived');
writeFileSync(`${dir}levels/L01-sky.json`, JSON.stringify(level, null, 2) + '\n');
writeFileSync(`${dir}waves.json`, JSON.stringify(chosen, null, 2) + '\n');
writeFileSync(`${dir}behaviour/drone.fsm.json`, JSON.stringify(DRONE, null, 2) + '\n');
writeFileSync(`${dir}behaviour/tank.fsm.json`, JSON.stringify(TANK, null, 2) + '\n');
writeFileSync(`${dir}behaviour/drift.fsm.json`, JSON.stringify(DRIFT, null, 2) + '\n');
console.log('wrote levels/L01-sky.json, waves.json, behaviour/{drone,tank,drift}.fsm.json');
