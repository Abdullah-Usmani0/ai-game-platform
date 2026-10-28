import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LevelJson } from '@gg/schemas';
import { validateRamp } from '@gg/validators';
const dir = process.argv[2] ?? 'game/content/levels';
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const levels = files.map((f) => {
  const l = LevelJson.parse(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  return { id: l.id, difficulty: l.ramp?.difficulty ?? 0, file: f };
});
for (const l of levels) console.log(`${l.file}: ${l.id} difficulty ${l.difficulty}`);
const r = validateRamp(levels);
for (const i of r.issues) console.log(`${i.severity}: ${i.code}: ${i.message}`);
console.log(r.ok ? 'RAMP OK' : 'RAMP FAILED');
process.exit(r.ok ? 0 : 1);
