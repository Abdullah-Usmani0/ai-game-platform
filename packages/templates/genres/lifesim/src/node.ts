import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CropTable } from '@gg/schemas';
import type { DesignContent, GenreManifest } from '@gg/template-core';
import { err } from '@gg/validators';
import { lifesimCheck } from './check.js';
import { cropTableIssues, describeFarmRules, farmRulesFromSystems } from './crops.js';
import { EXEMPLARS } from './exemplars.js';
import { lifesimRuntime } from './index.js';
import { generateFarm } from './level/generate.js';
import { PANELS } from './panels.js';
import { DEFAULT_CROPS } from './systems/farm-kit.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** The farm's crops, written from the player's idea and held to the game's rules: content/crops.json. */
export const CROPS_CONTENT: DesignContent = {
  key: 'crops',
  artifact: 'CropTable',
  readBy: ['farming', 'shop', 'shipping', 'season'],
  guide: read('./gdd/crops.md'),
  fallback: { version: 1, crops: DEFAULT_CROPS },
  check: (value, systems) => {
    const table = CropTable.safeParse(value);
    if (!table.success) return table.error.issues.map((i) => err('crops_schema', `content/crops.json ${i.path.join('.') || '(root)'}: ${i.message}`));
    return cropTableIssues(table.data, farmRulesFromSystems(systems));
  },
  rules: (systems) => describeFarmRules(farmRulesFromSystems(systems)),
  // A full shop, in as many shapes as it has crops.
  score: (value) => {
    const crops = (value as CropTable).crops;
    return crops.length + new Set(crops.map((c) => c.look.shape)).size / 2;
  },
};

export const lifesim: GenreManifest = {
  ...lifesimRuntime,
  levelGrammar: { kind: 'farm', generate: generateFarm, validate: lifesimCheck.validate },
  designContent: [CROPS_CONTENT],
  bots: lifesimCheck.bots,
  solverBot: lifesimCheck.solverBot,
  gddFragment: read('./gdd/fragment.md'),
  interviewFragment: read('./gdd/interview.md'),
  // A level is a season. A farm has no enemies, items or bosses: its crops and its economy are the content.
  scopeBudget: {
    small: { levels: 2, enemies: 0, items: 0, bosses: 0 },
    medium: { levels: 3, enemies: 0, items: 0, bosses: 0 },
    large: { levels: 4, enemies: 0, items: 0, bosses: 0 },
  },
  gddDefaults: {
    pillars: ['every day ends with something grown', 'the field is a plan, never a chore', 'a season pays the patient'],
    verbs: ['move', 'work', 'choose seed'],
    feedbackEvents: [
      { event: 'pickup', channels: ['particle', 'sfx'] },
      { event: 'level_complete', channels: ['sfx', 'particle'] },
    ],
    targets: { sessionMin: 20, levelTimeS: 300, deathsPerLevel: 0 },
  },
  panels: PANELS,
  exemplars: EXEMPLARS,
  samples: ['samples/lifesim'],
};
export * from './index.js';
export * from './crops.js';
export { generateFarm, fieldPlots, fieldShape } from './level/generate.js';
export { validateFarm, footprint, farmDistances } from './level/validate.js';
export { BOTS, farmer } from './bots.js';
export * from './check.js';
