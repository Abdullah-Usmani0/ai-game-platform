import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG, genre } from '@gg/templates/node';
const id = process.argv[2];
// Composed parameters (entity types, switches) are the composition's to set, so the skill never sees them.
const entries = Object.values(CATALOG)
  .filter((c) => !id || c.genres === '*' || c.genres.includes(id as never))
  .map((c) => ({ ...c, params: Object.fromEntries(Object.entries(c.params).filter(([, p]) => !p.composed)) }));
const out = fileURLToPath(new URL('../catalog.json', import.meta.url));
const payload = { genre: id ?? '*', feelPresets: id ? Object.keys(genre(id).feelPresets) : [], required: id ? genre(id).requiredSystems : [], optional: id ? genre(id).optionalSystems : [], systems: entries };
writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify(payload, null, 2));
