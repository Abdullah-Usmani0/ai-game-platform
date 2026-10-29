/**
 * The universal explorer against every curated genre: generated levels, the genre's default systems, the explorer with
 * no genre knowledge next to the genre's own solver bot. Usage: explore-sweep.ts [genres] [difficulties] [seeds] [budget].
 */
import { createSim } from '@gg/sdk';
import { explore, explorerOptionsFor, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { GENRES } from '../src/node.js';

const genres = (process.argv[2] ?? Object.keys(GENRES).join(',')).split(',');
const difficulties = (process.argv[3] ?? '0.2,0.5').split(',').map(Number);
const seeds = Number(process.argv[4] ?? 3);
const budget = Number(process.argv[5] ?? 150000);

for (const id of genres) {
  const g = GENRES[id]!;
  let wins = 0;
  let solved = 0;
  let total = 0;
  const rows: string[] = [];
  for (const difficulty of difficulties) {
    for (let seed = 1; seed <= seeds; seed++) {
      const params = { seed, difficulty };
      const level = g.levelGrammar.generate(params);
      if (!g.levelGrammar.validate(level, g.feelPresets[g.defaultFeel]!).ok) continue;
      const content = g.extraContent?.(params) ?? {};
      const options = simOptionsFor(g, systemsJsonFor(g), { behaviours: g.defaultBehaviours, content });
      const make = () => createSim({ ...options, level, seed: 1 });
      total++;
      const bot = runBot(make(), g.bots[g.solverBot]!, 120 * 60);
      if (bot.completed) solved++;
      const t0 = Date.now();
      const r = explore(make, { budget, ...explorerOptionsFor(Object.values(g.systems).map((m) => m.meta)) });
      const ms = Date.now() - t0;
      if (r.completed) wins++;
      rows.push(`  d${difficulty} s${seed}: explorer ${r.completed ? `WON in ${r.ticks}t` : `no (best progress ${r.best.progress}, score ${r.best.score})`} after ${r.explored}t, ${r.cells} cells, ${ms} ms | ${g.solverBot}: ${bot.completed ? `won ${bot.ticks}t` : 'no'}`);
    }
  }
  console.log(`${id}: explorer ${wins}/${total}, solver bot ${solved}/${total}`);
  for (const r of rows) console.log(r);
}
