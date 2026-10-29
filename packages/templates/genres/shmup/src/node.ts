import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GenreManifest } from '@gg/template-core';
import { shmupCheck } from './check.js';
import { EXEMPLARS } from './exemplars.js';
import { shmupRuntime } from './index.js';
import { generateSky, generateWaves } from './level/generate.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const shmup: GenreManifest = {
  ...shmupRuntime,
  levelGrammar: { kind: 'arena', generate: generateSky, validate: shmupCheck.validate },
  extraContent: (params) => ({ waves: generateWaves(params, 60) }),
  bots: shmupCheck.bots,
  solverBot: shmupCheck.solverBot,
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  // One arena whatever the tier (the arena grammar builds one): bigger tiers bring harder waves and more enemy and item types.
  scopeBudget: {
    small: { levels: 1, enemies: 2, items: 1, bosses: 0 },
    medium: { levels: 1, enemies: 3, items: 1, bosses: 0 },
    large: { levels: 1, enemies: 3, items: 2, bosses: 1 },
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
export * from './check.js';
