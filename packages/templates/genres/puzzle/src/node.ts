import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GenreManifest } from '@gg/template-core';
import { puzzleCheck } from './check.js';
import { EXEMPLARS } from './exemplars.js';
import { puzzleRuntime } from './index.js';
import { generatePuzzle } from './level/generate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const puzzle: GenreManifest = {
  ...puzzleRuntime,
  levelGrammar: { kind: 'tilemap', generate: generatePuzzle, validate: puzzleCheck.validate },
  bots: puzzleCheck.bots,
  solverBot: puzzleCheck.solverBot,
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  scopeBudget: {
    small: { levels: 3, enemies: 0, items: 0, bosses: 0 },
    medium: { levels: 6, enemies: 0, items: 0, bosses: 0 },
    large: { levels: 10, enemies: 0, items: 0, bosses: 0 },
  },
  gddDefaults: {
    pillars: ['every push is a decision', 'boards read at a glance', 'mistakes cost nothing: undo is free'],
    verbs: ['move', 'push', 'undo'],
    feedbackEvents: [
      { event: 'move', channels: ['sfx'] },
      { event: 'push', channels: ['sfx', 'particle'] },
      { event: 'undo', channels: ['sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
    targets: { sessionMin: 10, levelTimeS: 60, deathsPerLevel: 0 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/puzzle'],
};
export * from './index.js';
export { generatePuzzle, cratesFor, pushTarget } from './level/generate.js';
export { validatePuzzle, SOLVE_BUDGET } from './level/validate.js';
export { BOTS, boardFromSim, solver, chaos } from './bots.js';
export * from './check.js';
