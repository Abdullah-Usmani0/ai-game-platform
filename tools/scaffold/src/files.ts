/** Static file templates for a scaffolded game. Kept as strings so the scaffold stays dependency-free at runtime. */

export const INDEX_HTML = (title: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0b0b14; overflow: hidden; }
      #game { width: 100%; height: 100%; }
      canvas { image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script src="./engine.js"></script>
    <script src="./game.js"></script>
  </body>
</html>
`;

export const VITE_CONFIG = `import { fileURLToPath } from 'node:url';
import { gameViteConfig } from '@gg/config/vite-game';
const root = fileURLToPath(new URL('.', import.meta.url));
export default gameViteConfig({ root, entry: 'src/main.ts' });
`;

export const TSCONFIG = `{ "extends": "@gg/config/tsconfig.browser.json", "compilerOptions": { "types": ["node", "vite/client"] }, "include": ["src", "tests"] }
`;

export const ESLINT_CONFIG = `import { baseConfig } from '@gg/config/eslint';
export default baseConfig({ browser: true, gluets: ['src/systems/**/*.ts'] });
`;

export const VITEST_CONFIG = `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
`;

export const FINISH_BUILD = `// Copies index.html and the shared engine chunk next to the built game.js so dist/ is a servable bundle.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const enginePkg = require.resolve('@gg/engine/package.json');
const engineDist = fileURLToPath(new URL('./dist/engine.js', \`file://\${enginePkg}\`));
if (!existsSync(engineDist)) throw new Error(\`engine chunk missing: \${engineDist} (run pnpm --filter @gg/engine build)\`);
mkdirSync(\`\${here}dist\`, { recursive: true });
copyFileSync(\`\${here}index.html\`, \`\${here}dist/index.html\`);
copyFileSync(engineDist, \`\${here}dist/engine.js\`);
console.log('bundle ready in', \`\${here}dist\`);
`;

export const SYSTEMS_INDEX = `import type { SystemDef } from '@gg/sdk';

/**
 * Bespoke simulation systems for this game. Add a file per system under src/systems/, written in GlueTS
 * with \`defineSystem\` from '@gg/sdk', and list it here. Template systems come from systems.json instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BESPOKE: SystemDef<any>[] = [];
`;

export const GAME_TS = (genre: string, runtimeImport: string, runtimeName: string) => `import type { BehaviourFsm, EcaRule, LevelJson, SystemsJson } from '@gg/schemas';
import { feedbackBinder, type FeedbackBinding, type SimOptions, type SystemDef } from '@gg/sdk';
import { ${runtimeName} } from '${runtimeImport}';
import feedbackJson from '../design/feedback.json';
import systemsJson from '../design/systems.json';
import { BESPOKE } from './systems/index.js';

const SYSTEMS = systemsJson as unknown as SystemsJson;
const runtime = ${runtimeName};

function sorted<T>(mods: Record<string, T>): T[] {
  return Object.keys(mods)
    .sort()
    .map((k) => mods[k] as T);
}

const levelFiles = import.meta.glob('../content/levels/*.json', { eager: true, import: 'default' }) as Record<string, LevelJson>;
const behaviourFiles = import.meta.glob('../content/behaviour/*.fsm.json', { eager: true, import: 'default' }) as Record<string, BehaviourFsm>;
const ruleFiles = import.meta.glob('../content/rules/*.eca.json', { eager: true, import: 'default' }) as Record<string, EcaRule>;
const extraContent = import.meta.glob('../content/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const LEVELS: LevelJson[] = sorted(levelFiles);
export const BEHAVIOURS: BehaviourFsm[] = [...runtime.defaultBehaviours.filter((b) => !Object.values(behaviourFiles).some((f) => f.id === b.id)), ...sorted(behaviourFiles)];
export const RULES: EcaRule[] = [...runtime.defaultRules, ...sorted(ruleFiles)];
export const FEEDBACK = feedbackJson as FeedbackBinding[];
export const CONTENT: Record<string, unknown> = Object.fromEntries(Object.entries(extraContent).map(([k, v]) => [k.replace(/^.*\\/([^/]+)\\.json$/, '$1'), v]));

/** Template systems selected in design/systems.json (in that order), then bespoke systems, then the feedback binder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templateSystems: SystemDef<any>[] = SYSTEMS.systems.map((s) => {
  const mod = runtime.systems[s.id];
  if (!mod) throw new Error(\`systems.json names unknown system '\${s.id}' for genre ${genre}\`);
  return mod.create();
});

export const SIM_OPTIONS: Omit<SimOptions, 'level' | 'seed'> = {
  feel: runtime.feelPresets[SYSTEMS.feelPreset] ?? runtime.feelPresets[runtime.defaultFeel]!,
  systems: [...templateSystems, ...BESPOKE, feedbackBinder(FEEDBACK)],
  entityDefs: runtime.entityDefs,
  player: runtime.player,
  behaviours: BEHAVIOURS,
  rules: RULES,
  params: Object.fromEntries(SYSTEMS.systems.map((s) => [s.id, s.params])),
  content: CONTENT,
  movementMode: runtime.movementMode,
};
`;

export const MAIN_TS = (gameId: string) => `import type { StyleCard } from '@gg/schemas';
import { createGame } from '@gg/sdk/render';
import styleJson from '../design/style.json';
import { LEVELS, SIM_OPTIONS } from './game.js';

const style = styleJson as unknown as StyleCard;

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: '${gameId}', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: style.canvas,
    pixelArt: style.pixelArt,
    palette: { background: style.palette.background, mid: style.palette.mid, foreground: style.palette.foreground, accent: style.palette.accent, danger: style.palette.danger, ui: style.palette.ui },
    camera: { lerp: style.camera.lerp, maxShake: style.camera.maxShake, deadzone: style.camera.deadzone },
  },
  parent: 'game',
  defaultSeed: 1,
});
`;

export const GAME_TEST = (genre: string) => `import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { LEVELS, SIM_OPTIONS } from '../../src/game.js';
import { BOTS, SOLVER_BOT } from './bots.js';

describe('${genre} game', () => {
  it('every level is completable by the solver bot', () => {
    for (const level of LEVELS) {
      const result = runBot(createSim({ ...SIM_OPTIONS, level, seed: 1 }), BOTS[SOLVER_BOT]!, 90 * 60);
      expect(result.completed, \`level \${level.id} not completed (ticks=\${result.ticks} deaths=\${result.deaths})\`).toBe(true);
    }
  });
  it('is deterministic', () => {
    const level = LEVELS[0]!;
    const a = runBot(createSim({ ...SIM_OPTIONS, level, seed: 3 }), BOTS['chaos']!, 600);
    const b = runBot(createSim({ ...SIM_OPTIONS, level, seed: 3 }), BOTS['chaos']!, 600);
    expect(a.finalHash).toBe(b.finalHash);
  });
});
`;

export const BOTS_TS = (nodeImport: string, manifestName: string) => `import { ${manifestName} } from '${nodeImport}';
export const BOTS = ${manifestName}.bots;
export const SOLVER_BOT = ${manifestName}.solverBot;
`;

export const DEVIATIONS_MD = `# Deviations from the GDD

Append-only. One entry per deviation: what, why, date.
`;

export const ASSET_MANIFEST = `{ "version": 1, "assets": [] }
`;

export const ASSET_REQUESTS = `{ "version": 1, "requests": [] }
`;
