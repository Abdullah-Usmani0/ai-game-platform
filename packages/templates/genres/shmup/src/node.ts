import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelJson } from '@gg/schemas';
import { validateArena, type GenreManifest } from '@gg/template-core';
import { BOTS } from './bots.js';
import { EXEMPLARS } from './exemplars.js';
import { shmupRuntime } from './index.js';
import { generateSky, generateWaves } from './level/generate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const shmup: GenreManifest = {
  ...shmupRuntime,
  levelGrammar: { kind: 'arena', generate: generateSky, validate: (level: LevelJson) => validateArena(level) },
  extraContent: (params) => ({ waves: generateWaves(params, 60) }),
  bots: BOTS,
  solverBot: 'dodger',
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  scopeBudget: {
    small: { levels: 1, enemies: 2, items: 1, bosses: 0 },
    medium: { levels: 2, enemies: 3, items: 1, bosses: 0 },
    large: { levels: 3, enemies: 3, items: 2, bosses: 1 },
  },
  gddDefaults: {
    pillars: ['every bullet is readable', 'the ship answers instantly', 'sixty seconds of rising pressure'],
    verbs: ['move', 'shoot', 'dash'],
    feedbackEvents: [
      { event: 'dash', channels: ['sfx'] },
      { event: 'hit', channels: ['flash', 'sfx'] },
      { event: 'death', channels: ['shake', 'flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
    targets: { sessionMin: 5, levelTimeS: 60, deathsPerLevel: 2 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/shmup'],
};
export * from './index.js';
export { generateSky, generateWaves } from './level/generate.js';
export { BOTS } from './bots.js';
