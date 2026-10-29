// Trace one seeker run: position, target, abilities and keys every N ticks, plus the cavern around the player.
import { SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { simOptionsFor } from '@gg/template-core';
import { metroidvania } from '../src/node.js';

const seed = Number(process.argv[2] ?? 1);
const difficulty = Number(process.argv[3] ?? 0.25);
const feel = process.argv[4] ?? 'celeste-class';
const every = Number(process.argv[5] ?? 30);
const level = metroidvania.levelGrammar.generate({ seed, difficulty });
const systems = SystemsJson.parse({ version: 1, genre: 'metroidvania', feelPreset: feel, systems: Object.keys(metroidvania.systems).map((id) => ({ id, params: {} })) });
const sim = createSim({ ...simOptionsFor(metroidvania, systems), level, seed: 1 });
const bot = metroidvania.bots['seeker']!;
const mem: Record<string, number> = {};
console.log(level.rows.map((r, y) => `${String(y).padStart(2)} ${r}`).join('\n'));
console.log('entities', level.entities.map((e) => `${e.type}@${e.x},${e.y}`).join(' '), 'spawn', level.spawn, 'goal', level.goal);
for (let t = 0; t < 90 * 60 && !sim.world.flags.won; t++) {
  const input = bot(sim, sim.tick, mem);
  sim.step(input);
  if (t % every === 0) {
    const p = sim.world.player;
    const keys = Object.entries(input).filter(([, v]) => v).map(([k]) => k[0]).join('');
    console.log(`t${t} x=${(p.x / 8).toFixed(1)} y=${(p.y / 8).toFixed(1)} vx=${p.vx.toFixed(0)} vy=${p.vy.toFixed(0)} g=${p.grounded ? 1 : 0} in=${keys} flags=${Object.keys(p.flags).join('+')} hud=${JSON.stringify(sim.world.hud)} mem=${JSON.stringify(mem)}`);
  }
}
console.log('won', sim.world.flags.won, 'tick', sim.tick, 'deaths', sim.world.deaths);
