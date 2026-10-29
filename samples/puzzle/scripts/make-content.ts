// Regenerates the sample's three boards from the puzzle generator: one, two and three crates. A seed is kept only
// when the solver validates the board and the solver bot finishes it in the real sim (the gate's own oracle).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot, simOptionsFor } from '@gg/template-core';
import { BOTS, generatePuzzle, puzzleRuntime, validatePuzzle } from '@gg/template-puzzle/node';

const dir = fileURLToPath(new URL('../content/levels/', import.meta.url));
const systems: SystemsJson = { version: 1, genre: 'puzzle', feelPreset: 'grid-snappy', systems: [{ id: 'grid-push', params: {} }] };
const plan = [
  { file: 'L01-cellar-01.json', id: 'cellar-01', name: 'Cellar 1', difficulty: 0.1, from: 3 },
  { file: 'L02-cellar-02.json', id: 'cellar-02', name: 'Cellar 2', difficulty: 0.3, from: 11 },
  { file: 'L03-cellar-03.json', id: 'cellar-03', name: 'Cellar 3', difficulty: 0.5, from: 23 },
];
for (const [i, p] of plan.entries()) {
  let chosen = null;
  for (let seed = p.from; seed < p.from + 20 && !chosen; seed++) {
    const level = generatePuzzle({ seed, difficulty: p.difficulty });
    const r = validatePuzzle(level);
    if (!r.ok) continue;
    const run = runBot(createSim({ ...simOptionsFor(puzzleRuntime, systems), level, seed: 1 }), BOTS['solver']!, 60 * 60);
    console.log(`${p.id} seed ${seed}: ${r.metrics['pushes']} pushes, ${r.metrics['moves']} moves, solver ${run.completed ? `done in ${run.ticks} ticks` : 'failed'}`);
    if (run.completed) chosen = { ...level, id: p.id, name: p.name, ramp: { segment: i, difficulty: p.difficulty } };
  }
  if (!chosen) throw new Error(`no seed worked for ${p.id}`);
  writeFileSync(`${dir}${p.file}`, JSON.stringify(chosen, null, 2) + '\n');
}
console.log(`wrote ${plan.map((p) => p.file).join(', ')}`);
