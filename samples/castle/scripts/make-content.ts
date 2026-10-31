// Regenerates the sample region, its behaviours and the route bot's run through it: the first seed whose region the
// validator accepts under both feels and the route bot finishes on sim seed 1, at difficulty 0.5 (both gates, two
// altars, ghouls, hounds and a gargoyle). The run is the frame the create page's card is taken from.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelJson, LevelProof } from '@gg/schemas';
import { createSim, logToScript } from '@gg/sdk';
import { levelTicksOf, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { castle } from '@gg/template-castle/node';

const dir = fileURLToPath(new URL('../content/', import.meta.url));
const options = simOptionsFor(castle, systemsJsonFor(castle), { behaviours: castle.defaultBehaviours });
let chosen: { level: LevelJson; proof: LevelProof } | null = null;
for (let seed = 1; seed <= 20 && !chosen; seed++) {
  const level: LevelJson = { ...castle.levelGrammar.generate({ seed, difficulty: 0.5 }), id: 'salt-chapel', name: 'The Salt Chapel' };
  const valid = Object.values(castle.feelPresets).every((f) => castle.levelGrammar.validate(level, f).ok);
  const sim = createSim({ ...options, level, seed: 1 });
  const r = valid ? runBot(sim, castle.bots['route']!, levelTicksOf(options)) : null;
  console.log(`seed ${seed}: ${!valid ? 'rejected by the validator' : r?.completed ? `route ${Math.round(r.ticks / 6) / 10}s, ${r.deaths} deaths` : 'route failed'}`);
  if (r?.completed) chosen = { level, proof: { version: 1, level: level.id, seed: 1, ticks: r.ticks, by: 'solver', script: logToScript(sim.inputLog(), r.ticks) } };
}
if (!chosen) throw new Error('no seed produced a region the route bot finishes');
for (const sub of ['levels', 'behaviour', 'proofs']) mkdirSync(`${dir}${sub}`, { recursive: true });
writeFileSync(`${dir}levels/R01-salt-chapel.json`, JSON.stringify(chosen.level, null, 2) + '\n');
for (const b of castle.defaultBehaviours) writeFileSync(`${dir}behaviour/${b.id}.fsm.json`, JSON.stringify(b, null, 2) + '\n');
writeFileSync(`${dir}proofs/salt-chapel.json`, JSON.stringify(chosen.proof, null, 2) + '\n');
console.log(`wrote levels/R01-salt-chapel.json, behaviour/{${castle.defaultBehaviours.map((b) => b.id).join(',')}}.fsm.json, proofs/salt-chapel.json`);
