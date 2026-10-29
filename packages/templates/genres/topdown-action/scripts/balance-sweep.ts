/**
 * Balance sweep: clearer and coward outcomes across floor seeds and difficulties, with dash invulnerability on (the
 * genre's Hades-style setup). Usage: balance-sweep.ts [difficulties] [seeds] [boss 0|1].
 */
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { generateRooms } from '../src/level/generate.js';
import { validateRooms } from '../src/level/validate.js';
import { topdownAction } from '../src/node.js';

const difficulties = (process.argv[2] ?? '0.2,0.45,0.6,0.75').split(',').map(Number);
const seeds = Number(process.argv[3] ?? 10);
const boss = Number(process.argv[4] ?? 0);
for (const d of difficulties) {
  let wins = 0;
  let valid = 0;
  const detail: string[] = [];
  for (let s = 1; s <= seeds; s++) {
    const level = generateRooms({ seed: s, difficulty: d, boss });
    if (!validateRooms(level).ok) {
      detail.push(`${s}:invalid`);
      continue;
    }
    valid++;
    const mk = () => createSim({ level, feel: topdownAction.feelPresets[topdownAction.defaultFeel]!, seed: 1, systems: Object.values(topdownAction.systems).map((m) => m.create()), entityDefs: topdownAction.entityDefs, player: topdownAction.player, behaviours: topdownAction.defaultBehaviours, params: { 'movement-topdown': { dashInvuln: true } }, content: {}, movementMode: 'topdown' });
    const r = runBot(mk(), topdownAction.bots['clearer']!, 90 * 60);
    const c = runBot(mk(), topdownAction.bots['coward']!, 60 * 60);
    if (r.completed) wins++;
    detail.push(`${s}:${r.completed ? `W${Math.round(r.ticks / 60)}` : `L${Math.round(r.ticks / 60)}`}${c.completed ? '!' : ''}`);
  }
  console.log(`d=${d} clearer wins ${wins}/${valid}  ${detail.join(' ')}`);
}
