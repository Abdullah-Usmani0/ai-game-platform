// Copies index.html and the shared engine chunk next to the built game.js so dist/ is a servable bundle.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const enginePkg = require.resolve('@gg/engine/package.json');
const engineDist = fileURLToPath(new URL('./dist/engine.js', `file://${enginePkg}`));
if (!existsSync(engineDist)) throw new Error(`engine chunk missing: ${engineDist} (run pnpm --filter @gg/engine build)`);
mkdirSync(`${here}dist`, { recursive: true });
copyFileSync(`${here}index.html`, `${here}dist/index.html`);
copyFileSync(engineDist, `${here}dist/engine.js`);
console.log('bundle ready in', `${here}dist`);
