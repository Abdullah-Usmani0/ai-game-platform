import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const versions = readFileSync(fileURLToPath(new URL('../src/versions.ts', import.meta.url)), 'utf8');
const phaser = /PHASER_VERSION = '([^']+)'/.exec(versions)?.[1];
const sdk = /SDK_VERSION = '([^']+)'/.exec(versions)?.[1];
const file = `${dist}engine.js`;
const raw = statSync(file).size;
const gz = gzipSync(readFileSync(file)).length;
const versioned = `engine-${phaser}-${sdk}.js`;
copyFileSync(file, `${dist}${versioned}`);
writeFileSync(`${dist}engine.json`, JSON.stringify({ phaser, sdk, file: versioned, bytes: raw, gzipBytes: gz }, null, 2) + '\n');
console.log(`engine chunk ${versioned}: ${(raw / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(0)} KB gzip`);
