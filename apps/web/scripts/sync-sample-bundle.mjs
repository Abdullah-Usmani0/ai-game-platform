// Copies the built sample bundle into public/bundles/sample so the play page can serve it in Phase 0.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const src = fileURLToPath(new URL('../../../samples/platformer/dist/', import.meta.url));
const dest = fileURLToPath(new URL('../public/bundles/sample/', import.meta.url));
if (!existsSync(`${src}index.html`)) throw new Error(`sample bundle not built at ${src}`);
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('copied sample bundle to', dest);
