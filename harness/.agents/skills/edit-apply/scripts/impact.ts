import { readFileSync } from 'node:fs';
import { SystemsJson } from '@gg/schemas';
import { CATALOG } from '@gg/templates/node';
import { impact } from '@gg/validators';
const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: impact.ts <before.json> <after.json>');
  process.exit(2);
}
console.log(JSON.stringify(impact(SystemsJson.parse(JSON.parse(readFileSync(a, 'utf8'))), SystemsJson.parse(JSON.parse(readFileSync(b, 'utf8'))), CATALOG)));
