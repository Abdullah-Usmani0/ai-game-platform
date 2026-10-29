// Regenerates the sample's floors and enemy behaviour from the topdown-action generators, keeping only seeds the
// clearer bot completes with the sample's own systems and params (the same oracle the scaffold and the LEVELS stage
// use). Floor 3 is the warden's lair. Floors are checked one by one, without boons, as the gates check them.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { ARCHER, BOTS, BRUTE, GRUNT, WARDEN, generateRooms, validateRooms } from '@gg/template-topdown-action/node';
import { SIM_OPTIONS } from '../src/game.js';

const dir = fileURLToPath(new URL('../content/', import.meta.url));
const plan = [
  { file: 'L01-ember-01.json', id: 'ember-01', name: 'Ember Halls 1', difficulty: 0.25, from: 11, boss: 0 },
  { file: 'L02-ember-02.json', id: 'ember-02', name: 'Ember Halls 2', difficulty: 0.5, from: 31, boss: 0 },
  { file: 'L03-ember-03.json', id: 'ember-03', name: "The Warden's Lair", difficulty: 0.55, from: 51, boss: 1 },
];
const options = { ...SIM_OPTIONS, behaviours: [GRUNT, ARCHER, BRUTE, WARDEN] };
for (const [i, p] of plan.entries()) {
  let chosen = null;
  for (let seed = p.from; seed < p.from + 40 && !chosen; seed++) {
    const level = generateRooms({ seed, difficulty: p.difficulty, boss: p.boss });
    if (!validateRooms(level).ok) continue;
    const r = runBot(createSim({ ...options, level, seed: 1 }), BOTS['clearer']!, 90 * 60);
    if (r.completed) chosen = { ...level, id: p.id, name: p.name, ramp: { segment: i, difficulty: p.difficulty } };
    console.log(`${p.id} seed ${seed}: ${r.completed ? `ok in ${r.ticks} ticks, ${r.deaths} deaths` : 'not completed'}`);
  }
  if (!chosen) throw new Error(`no seed completed ${p.id}`);
  writeFileSync(`${dir}levels/${p.file}`, JSON.stringify(chosen, null, 2) + '\n');
}
for (const fsm of [GRUNT, ARCHER, BRUTE, WARDEN]) writeFileSync(`${dir}behaviour/${fsm.id}.fsm.json`, JSON.stringify(fsm, null, 2) + '\n');
console.log('wrote levels/L01-L03 and behaviour/grunt, archer, brute, warden');
