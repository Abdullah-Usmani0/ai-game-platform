// Generator sweep: per difficulty, how many seeds give a valid board, how many the solver bot finishes in the real
// sim, the fewest pushes and moves the boards need, and how long generation takes. `pnpm sweep [seeds]`.
import type { SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot, simOptionsFor } from '@gg/template-core';
import { BOTS, generatePuzzle, puzzleRuntime, validatePuzzle } from '../src/node.js';

const seeds = Number(process.argv[2] ?? 12);
const systems: SystemsJson = { version: 1, genre: 'puzzle', feelPreset: 'grid-snappy', systems: [{ id: 'grid-push', params: {} }] };
const rows: string[] = [];
for (const d of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
  let valid = 0;
  let solved = 0;
  const pushes: number[] = [];
  const moves: number[] = [];
  let ms = 0;
  let slowest = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const level = generatePuzzle({ seed, difficulty: d });
    const took = performance.now() - t0;
    ms += took;
    slowest = Math.max(slowest, took);
    const r = validatePuzzle(level);
    if (!r.ok) continue;
    valid++;
    pushes.push(Number(r.metrics['pushes']));
    moves.push(Number(r.metrics['moves']));
    const run = runBot(createSim({ ...simOptionsFor(puzzleRuntime, systems), level, seed: 1 }), BOTS['solver']!, 60 * 60);
    if (run.completed) solved++;
  }
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
  rows.push(`d=${d.toFixed(2)}  valid ${valid}/${seeds}  solver ${solved}/${seeds}  pushes avg ${avg(pushes)} [${Math.min(...pushes)}-${Math.max(...pushes)}]  moves avg ${avg(moves)}  gen ${(ms / seeds).toFixed(0)} ms avg, ${slowest.toFixed(0)} ms max`);
}
console.log(rows.join('\n'));
