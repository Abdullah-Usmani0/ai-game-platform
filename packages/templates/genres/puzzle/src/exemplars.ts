import type { Exemplar } from '@gg/template-core';
import { generatePuzzle } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'level', prompt: 'A first board: one crate, one target, a wall to walk around; teaches pushing.', artifact: generatePuzzle({ seed: 3, difficulty: 0.05 }) },
  { kind: 'level', prompt: 'A two-crate warehouse corner where the order of pushes matters.', artifact: generatePuzzle({ seed: 11, difficulty: 0.35 }) },
  { kind: 'level', prompt: 'A late board: three crates around inner walls; one wrong push into a corner loses it.', artifact: generatePuzzle({ seed: 23, difficulty: 0.65 }) },
  {
    kind: 'systems',
    prompt: 'A calm push-the-crates puzzle game with quick steps, held keys that repeat, free undo and a restart key.',
    artifact: { version: 1, genre: 'puzzle', feelPreset: 'grid-snappy', systems: [{ id: 'grid-push', params: { stepTicks: 6, repeatDelayTicks: 14, repeatTicks: 6, allowUndo: true, bonus: 10 } }] },
  },
];
