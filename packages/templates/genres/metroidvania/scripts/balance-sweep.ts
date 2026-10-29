// Balance sweep: across feel presets, difficulties and seeds, how many generated caverns validate, how many the
// seeker finishes (and how long it takes), and how many the plain walker finishes (gates must stop it).
import { SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot, simOptionsFor } from '@gg/template-core';
import { metroidvania } from '../src/node.js';

const seeds = Number(process.argv[2] ?? 8);
const only = process.argv[3];
const difficulties = [0.1, 0.15, 0.25, 0.45, 0.65, 0.85];
for (const feel of Object.keys(metroidvania.feelPresets)) {
  if (only && feel !== only) continue;
  const systems = SystemsJson.parse({ version: 1, genre: 'metroidvania', feelPreset: feel, systems: Object.keys(metroidvania.systems).map((id) => ({ id, params: {} })) });
  for (const difficulty of difficulties) {
    let valid = 0;
    let solved = 0;
    let walked = 0;
    const secs: number[] = [];
    const deaths: number[] = [];
    const notes: string[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const level = metroidvania.levelGrammar.generate({ seed, difficulty });
      const rep = metroidvania.levelGrammar.validate(level, metroidvania.feelPresets[feel]!);
      if (!rep.ok) {
        notes.push(`s${seed}: ${rep.issues.filter((i) => i.severity === 'error').map((i) => i.code).join(',')}`);
        continue;
      }
      valid++;
      const so = simOptionsFor(metroidvania, systems);
      const r = runBot(createSim({ ...so, level, seed: 1 }), metroidvania.bots['seeker']!, 90 * 60);
      if (r.completed) {
        solved++;
        secs.push(Math.round(r.ticks / 6) / 10);
        deaths.push(r.deaths);
      } else notes.push(`s${seed}: seeker stopped at ${Math.round(r.ticks / 60)}s (${r.deaths} deaths, stall ${r.stuckMaxTicks})`);
      const w = runBot(createSim({ ...so, level, seed: 1 }), metroidvania.bots['walker']!, 60 * 60);
      if (w.completed) walked++;
    }
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : '-');
    console.log(`${feel.padEnd(13)} d=${difficulty.toFixed(2)} valid ${valid}/${seeds} seeker ${solved}/${valid} (avg ${avg(secs)}s, deaths ${avg(deaths)}) walker ${walked}/${valid} ${rep(notes)}`);
  }
}
function rep(notes: string[]): string {
  return notes.length ? `| ${notes.slice(0, 4).join('; ')}` : '';
}
