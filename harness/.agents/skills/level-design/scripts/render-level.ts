import { readFileSync } from 'node:fs';
import { LevelJson } from '@gg/schemas';
const file = process.argv[2];
if (!file) {
  console.error('usage: render-level.ts <level.json>');
  process.exit(2);
}
const level = LevelJson.parse(JSON.parse(readFileSync(file, 'utf8')));
const rows = level.rows.map((r) => r.split(''));
for (const e of level.entities) {
  const row = rows[e.y];
  if (row && e.x < row.length) row[e.x] = e.type[0]!.toUpperCase();
}
console.log(`${level.id} ${level.width}x${level.height} tile ${level.tileSize} spawn ${level.spawn.x},${level.spawn.y} goal ${level.goal.x},${level.goal.y} difficulty ${level.ramp?.difficulty ?? '?'}`);
console.log(rows.map((r) => r.join('')).join('\n'));
console.log(`entities: ${level.entities.map((e) => `${e.type}@${e.x},${e.y}`).join(' ')}`);
