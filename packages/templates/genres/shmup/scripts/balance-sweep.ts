/** Balance sweep: dodger and afk outcomes across wave difficulties with default params (the arena is fixed; sim seeds vary). */
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { generateSky, generateWaves } from '../src/level/generate.js';
import { shmup } from '../src/node.js';

const difficulties = (process.argv[2] ?? '0.2,0.4,0.6,0.8').split(',').map(Number);
const seeds = Number(process.argv[3] ?? 10);
for (const d of difficulties) {
  const level = generateSky({ seed: 1, difficulty: d });
  const waves = generateWaves({ seed: 1, difficulty: d }, 60);
  let wins = 0;
  const detail: string[] = [];
  for (let s = 1; s <= seeds; s++) {
    const mk = () => createSim({ level, feel: shmup.feelPresets[shmup.defaultFeel]!, seed: s, systems: Object.values(shmup.systems).map((m) => m.create()), entityDefs: shmup.entityDefs, player: shmup.player, behaviours: shmup.defaultBehaviours, params: {}, content: { waves }, movementMode: 'topdown' });
    const r = runBot(mk(), shmup.bots['dodger']!, 61 * 60);
    const a = runBot(mk(), shmup.bots['afk']!, 61 * 60);
    if (r.completed) wins++;
    detail.push(`${s}:${r.completed ? `W` : `L${Math.round(r.ticks / 60)}`}${a.completed ? '!' : ''}`);
  }
  console.log(`d=${d} dodger wins ${wins}/${seeds}  ${detail.join(' ')}`);
}
