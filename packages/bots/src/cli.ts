import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { InputSegment } from '@gg/sdk';
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
    // still: a recorded run to drive the game with (a level proof, or a bare list of segments) instead of the runner.
    script: { type: 'string' },
  },
});
const [cmd, dirArg] = positionals;
if (!cmd || !dirArg) {
  console.error('usage: gg-bots <smoke|contact-sheet|still> <bundle-dir> [--seed N] [--ticks N] [--out DIR|FILE] [--replay-check] [--frames N] [--tick N] [--script PROOF.json]');
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
  const recorded = values.script ? (JSON.parse(readFileSync(resolve(values.script), 'utf8')) as InputSegment[] | { script: InputSegment[] }) : null;
  const script = recorded ? (Array.isArray(recorded) ? recorded : recorded.script) : undefined;
  const result = await still({ dir, seed, tick: Number(values.tick), script, out: outDir.endsWith('.png') ? outDir : `${outDir}/still-seed${seed}-t${values.tick}.png` });
  console.log(result.out);
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
} else {
  console.error(`unknown command ${cmd}`);
  process.exit(2);
}
