// Regenerates the sample's arena, waves and enemy behaviour from the survivors template generators.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHASER, generateArena, generateWaves } from '@gg/template-survivors/node';

const dir = fileURLToPath(new URL('../content/', import.meta.url));
const params = { seed: 4, difficulty: 0.25 };
writeFileSync(`${dir}arena.json`, JSON.stringify(generateArena(params), null, 2) + '\n');
writeFileSync(`${dir}waves.json`, JSON.stringify(generateWaves(params, 60), null, 2) + '\n');
writeFileSync(`${dir}behaviour/chaser.fsm.json`, JSON.stringify(CHASER, null, 2) + '\n');
console.log('wrote arena.json, waves.json, behaviour/chaser.fsm.json');
