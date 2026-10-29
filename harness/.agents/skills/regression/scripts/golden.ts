import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runSmoke } from '@gg/bots';
const dir = resolve(process.argv[2] ?? 'game/dist');
const out = resolve(process.argv[3] ?? 'game/reports/goldens');
mkdirSync(out, { recursive: true });
const res = await runSmoke({ dir, seed: 1, ticks: 600, outDir: out });
writeFileSync(join(out, 'golden.json'), JSON.stringify({ seed: 1, hash: res.manual.hash, tick: res.manual.tick, metrics: res.report.bots[0]?.metrics, completed: res.manual.flags.won }, null, 2) + '\n');
console.log(JSON.stringify({ out, hash: res.manual.hash, screenshot: res.screenshotPath }));
