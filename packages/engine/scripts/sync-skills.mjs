// Copies the Phaser-shipped agent skills into the harness as reference material (prefixed phaser-*).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const phaserDir = dirname(require.resolve('phaser/package.json'));
const src = join(phaserDir, 'skills');
const dest = fileURLToPath(new URL('../../../harness/.agents/skills/', import.meta.url));
if (!existsSync(src)) throw new Error(`no skills dir in phaser package at ${src}`);
mkdirSync(dest, { recursive: true });
for (const name of readdirSync(dest)) if (name.startsWith('phaser-')) rmSync(join(dest, name), { recursive: true, force: true });
let n = 0;
for (const name of readdirSync(src)) {
  cpSync(join(src, name), join(dest, `phaser-${name}`), { recursive: true });
  n++;
}
console.log(`synced ${n} phaser skills into ${dest}`);
