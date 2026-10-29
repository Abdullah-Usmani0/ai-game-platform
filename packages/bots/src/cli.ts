import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { contactSheet } from './contact-sheet.js';
import { runSmoke } from './smoke.js';
import { still } from './still.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: 'string', default: '1' },
    ticks: { type: 'string', default: '600' },
    out: { type: 'string', default: 'reports' },
    'replay-check': { type: 'boolean', default: false },
    frames: { type: 'string', default: '12' },
    tick: { type: 'string', default: '240' },
  },
});
const [cmd, dirArg] = positionals;
if (!cmd || !dirArg) {
  console.error('usage: gg-bots <smoke|contact-sheet|still> <bundle-dir> [--seed N] [--ticks N] [--out DIR|FILE] [--replay-check] [--frames N] [--tick N]');
  process.exit(2);
}
const dir = resolve(dirArg);
const seed = Number(values.seed);
const ticks = Number(values.ticks);
const outDir = resolve(values.out);

if (cmd === 'smoke') {
  const result = await runSmoke({ dir, seed, ticks, outDir, replayCheck: values['replay-check'] });
  const r = result.report;
  console.log(JSON.stringify({ passed: r.passed, readyMs: r.readyMs, hash: result.manual.hash, replayHashMatch: r.replayHashMatch, failures: r.failures, screenshot: result.screenshotPath }, null, 2));
  process.exit(r.passed ? 0 : 1);
} else if (cmd === 'contact-sheet') {
  const out = await contactSheet({ dir, seed, ticks, outDir, frames: Number(values.frames) });
  console.log(out);
} else if (cmd === 'still') {
  // One frame at the game's own resolution, `--out` naming the PNG file.
  const result = await still({ dir, seed, tick: Number(values.tick), out: outDir.endsWith('.png') ? outDir : `${outDir}/still-seed${seed}-t${values.tick}.png` });
  console.log(result.out);
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(2);
}
