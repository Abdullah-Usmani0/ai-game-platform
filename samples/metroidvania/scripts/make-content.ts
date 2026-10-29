// Regenerates the sample cavern and behaviours: the first seed whose cavern the validator accepts under every feel
// preset and the seeker finishes on sim seed 1, at difficulty 0.4 (all three gates, guards on both floors).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SystemsJson } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { runBot, simOptionsFor } from '@gg/template-core';
import { HOPPER, TURRET, WALKER, metroidvania } from '@gg/template-metroidvania/node';

const dir = fileURLToPath(new URL('../content/', import.meta.url));
const systems = SystemsJson.parse({ version: 1, genre: 'metroidvania', feelPreset: 'celeste-class', systems: Object.keys(metroidvania.systems).map((id) => ({ id, params: {} })) });
let chosen = null;
for (let seed = 1; seed <= 20 && !chosen; seed++) {
  const level = { ...metroidvania.levelGrammar.generate({ seed, difficulty: 0.4 }), id: 'undervault', name: 'Undervault' };
  const valid = Object.values(metroidvania.feelPresets).every((f) => metroidvania.levelGrammar.validate(level, f).ok);
  const r = valid ? runBot(createSim({ ...simOptionsFor(metroidvania, systems), level, seed: 1 }), metroidvania.bots['seeker']!, 90 * 60) : null;
  console.log(`seed ${seed}: ${!valid ? 'rejected by the validator' : r?.completed ? `seeker ${Math.round(r.ticks / 6) / 10}s, ${r.deaths} deaths` : 'seeker failed'}`);
  if (r?.completed) chosen = level;
}
if (!chosen) throw new Error('no seed produced a cavern the seeker finishes');
writeFileSync(`${dir}levels/L01-undervault.json`, JSON.stringify(chosen, null, 2) + '\n');
writeFileSync(`${dir}behaviour/walker.fsm.json`, JSON.stringify(WALKER, null, 2) + '\n');
writeFileSync(`${dir}behaviour/hopper.fsm.json`, JSON.stringify(HOPPER, null, 2) + '\n');
writeFileSync(`${dir}behaviour/turret.fsm.json`, JSON.stringify(TURRET, null, 2) + '\n');
console.log('wrote levels/L01-undervault.json, behaviour/{walker,hopper,turret}.fsm.json');
