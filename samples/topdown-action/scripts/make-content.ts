// Regenerates the sample's floors and enemy behaviour from the topdown-action generators, keeping only seeds
// the clearer bot completes (the same oracle the scaffold and the LEVELS stage use).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { ARCHER, BOTS, BRUTE, GRUNT, generateRooms, topdownAction, validateRooms } from '@gg/template-topdown-action/node';

const dir = fileURLToPath(new URL('../content/', import.meta.url));
const plan = [
  { file: 'L01-ember-01.json', id: 'ember-01', name: 'Ember Halls 1', difficulty: 0.2, from: 11 },
  { file: 'L02-ember-02.json', id: 'ember-02', name: 'Ember Halls 2', difficulty: 0.45, from: 31 },
];
for (const [i, p] of plan.entries()) {
  let chosen = null;
  for (let seed = p.from; seed < p.from + 40 && !chosen; seed++) {
    const level = generateRooms({ seed, difficulty: p.difficulty });
    if (!validateRooms(level).ok) continue;
    const sim = createSim({
      level,
      feel: topdownAction.feelPresets[topdownAction.defaultFeel]!,
      seed: 1,
      systems: Object.values(topdownAction.systems).map((m) => m.create()),
      entityDefs: topdownAction.entityDefs,
      player: topdownAction.player,
      behaviours: [GRUNT, ARCHER, BRUTE],
      params: {},
      content: {},
      movementMode: 'topdown',
    });
    const r = runBot(sim, BOTS['clearer']!, 90 * 60);
    if (r.completed) chosen = { ...level, id: p.id, name: p.name, ramp: { segment: i, difficulty: p.difficulty } };
    console.log(`${p.id} seed ${seed}: ${r.completed ? `ok in ${r.ticks} ticks` : 'not completed'}`);
  }
  if (!chosen) throw new Error(`no seed completed ${p.id}`);
  writeFileSync(`${dir}levels/${p.file}`, JSON.stringify(chosen, null, 2) + '\n');
}
writeFileSync(`${dir}behaviour/grunt.fsm.json`, JSON.stringify(GRUNT, null, 2) + '\n');
writeFileSync(`${dir}behaviour/archer.fsm.json`, JSON.stringify(ARCHER, null, 2) + '\n');
writeFileSync(`${dir}behaviour/brute.fsm.json`, JSON.stringify(BRUTE, null, 2) + '\n');
console.log('wrote levels/L01, levels/L02, behaviour/grunt, behaviour/archer, behaviour/brute');
