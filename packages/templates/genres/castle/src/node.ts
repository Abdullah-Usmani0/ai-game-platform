import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { THEMES } from '@gg/sdk/art';
import type { GenreManifest } from '@gg/template-core';
import { castleCheck } from './check.js';
import { EXEMPLARS } from './exemplars.js';
import { castleRuntime } from './index.js';
import { generateRegion } from './level/generate.js';
import { DEFAULT_MOVES } from './moves.js';
import { PANELS } from './panels.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export const castle: GenreManifest = {
  ...castleRuntime,
  levelGrammar: { kind: 'graph', generate: generateRegion, validate: castleCheck.validate },
  bots: castleCheck.bots,
  solverBot: castleCheck.solverBot,
  fairBot: castleCheck.fairBot,
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  // The tier's view; a moonlit gothic palette until the art direction draws one from the idea; the rig's quicker frames.
  styleDefaults: { canvas: { w: 480, h: 270 }, palette: { ...THEMES['gothic']!.roles, extra: [] }, animationFps: { character: 12, effects: 15 } },
  // One region at every tier, and the boss in it; the region grows with the tier (its halls, its later foes).
  scopeBudget: {
    small: { levels: 1, enemies: 3, items: 3, bosses: 1 },
    medium: { levels: 1, enemies: 6, items: 4, bosses: 1 },
    large: { levels: 1, enemies: 6, items: 5, bosses: 1 },
  },
  singleLevelDifficulty: { small: 0.3, medium: 0.5, large: 0.75 },
  gddDefaults: {
    pillars: ['every hall hides a way back', 'a relic reopens the castle', 'rest is earned at the altar'],
    verbs: ['run', 'jump', 'dash', 'cut', 'parry', 'drink', 'explore', 'rest'],
    feedbackEvents: [
      { event: 'jump', channels: ['sfx'] },
      { event: 'land', channels: ['sfx'] },
      { event: 'dash', channels: ['sfx', 'particle'] },
      { event: 'hit', channels: ['shake', 'flash', 'sfx'] },
      { event: 'death', channels: ['flash', 'sfx'] },
      { event: 'pickup', channels: ['sfx', 'particle', 'flash'] },
      { event: 'checkpoint', channels: ['sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
    targets: { sessionMin: 10, levelTimeS: 240, deathsPerLevel: 4 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  // The hero's frame data: the combat system strikes by it and the view draws each cut by its clock.
  shippedContent: { moves: DEFAULT_MOVES },
  samples: ['samples/castle'],
};
export * from './index.js';
export * from './check.js';
export { generateRegion, SCREEN_TILES, REGION_ROWS, BASE_WALK, LEDGE_TILES, CHASM_TILES, HIGH_WALK, MAX_REGION_TILES, SHAFT_TILES } from './level/generate.js';
export { validateRegion, CASTLE_TILE } from './level/validate.js';
export { world, envelopeFor, tallTiles, roomOf, pathTo, moves, MAX_STRETCH, type Abilities, type World, type WorldStep } from './level/progress.js';
export { route } from './bots.js';
export { AB_PREFIX } from './systems/abilities.js';
