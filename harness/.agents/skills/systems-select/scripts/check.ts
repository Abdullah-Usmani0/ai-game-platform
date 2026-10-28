import { readFileSync } from 'node:fs';
import { GddFrontmatter, SystemsJson } from '@gg/schemas';
import { CATALOG } from '@gg/templates/node';
import { checkSystems, parseFrontmatter } from '@gg/validators';
const systems = SystemsJson.parse(JSON.parse(readFileSync('game/design/systems.json', 'utf8')));
let gdd: GddFrontmatter | undefined;
try {
  const fm = parseFrontmatter(readFileSync('game/design/gdd.md', 'utf8'));
  gdd = fm ? GddFrontmatter.parse(fm.data) : undefined;
} catch {
  gdd = undefined;
}
const r = checkSystems(systems, CATALOG, gdd);
for (const i of r.issues) console.log(`${i.severity}: ${i.code}: ${i.message}`);
console.log(r.ok ? 'OK' : 'FAILED');
process.exit(r.ok ? 0 : 1);
