import { readFileSync, writeFileSync } from 'node:fs';
import { SystemsJson } from '@gg/schemas';
import { CATALOG } from '@gg/templates/node';
import { checkSystems, impact } from '@gg/validators';
const patch = JSON.parse(process.argv[2] ?? '{}') as Record<string, Record<string, number | string | boolean>>;
const path = 'game/design/systems.json';
const before = SystemsJson.parse(JSON.parse(readFileSync(path, 'utf8')));
const after = structuredClone(before);
for (const [id, params] of Object.entries(patch)) {
  const entry = after.systems.find((s) => s.id === id);
  if (!entry) {
    console.error(`system '${id}' is not selected`);
    process.exit(1);
  }
  Object.assign(entry.params, params);
}
const check = checkSystems(after, CATALOG);
if (!check.ok) {
  for (const i of check.issues) console.error(`${i.severity}: ${i.code}: ${i.message}`);
  process.exit(1);
}
writeFileSync(path, JSON.stringify(after, null, 2) + '\n');
console.log(JSON.stringify(impact(before, after, CATALOG)));
