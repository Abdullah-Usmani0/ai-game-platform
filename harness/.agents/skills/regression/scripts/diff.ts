import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { runSmoke } from '@gg/bots';
const dir = resolve(process.argv[2] ?? 'game/dist');
const goldens = resolve(process.argv[3] ?? 'game/reports/goldens');
const goldenPng = join(goldens, 'smoke-seed1-tick600.png');
if (!existsSync(goldenPng)) {
  console.log('no golden screenshot; run golden.ts on the accepted build first');
  process.exit(0);
}
const res = await runSmoke({ dir, seed: 1, ticks: 600, outDir: 'game/reports' });
const a = PNG.sync.read(readFileSync(goldenPng));
const b = PNG.sync.read(readFileSync(res.screenshotPath!));
if (a.width !== b.width || a.height !== b.height) {
  console.log(JSON.stringify({ changed: 1, reason: 'size differs' }));
  process.exit(1);
}
// Mask the HUD strip (top 12% of the frame) where text changes legitimately.
const maskRows = Math.floor(a.height * 0.12);
let diff = 0;
let total = 0;
const out = new PNG({ width: a.width, height: a.height });
for (let y = maskRows; y < a.height; y++) {
  for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    const d = Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
    total++;
    const changed = d > 48;
    if (changed) diff++;
    out.data[i] = changed ? 255 : a.data[i]! >> 2;
    out.data[i + 1] = changed ? 0 : a.data[i + 1]! >> 2;
    out.data[i + 2] = changed ? 0 : a.data[i + 2]! >> 2;
    out.data[i + 3] = 255;
  }
}
const ratio = diff / Math.max(1, total);
writeFileSync('game/reports/regression-diff.png', PNG.sync.write(out));
console.log(JSON.stringify({ changedPixels: diff, ratio: Math.round(ratio * 10000) / 10000, hashSame: res.manual.hash === JSON.parse(readFileSync(join(goldens, 'golden.json'), 'utf8')).hash }));
process.exit(ratio > 0.02 ? 1 : 0);
