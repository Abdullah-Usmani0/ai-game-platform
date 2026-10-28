import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { genre } from '@gg/templates/node';
const { positionals, values } = parseArgs({ allowPositionals: true, options: { seed: { type: 'string', default: '1' }, difficulty: { type: 'string', default: '0.3' }, out: { type: 'string' }, length: { type: 'string' }, id: { type: 'string' } } });
const id = positionals[0];
if (!id || !values.out) {
  console.error('usage: generate-level.ts <genre> --seed N --difficulty 0..1 --out file.json [--length N] [--id lvlid]');
  process.exit(2);
}
const g = genre(id);
const params = { seed: Number(values.seed), difficulty: Number(values.difficulty), ...(values.length ? { length: Number(values.length) } : {}) };
let level = g.levelGrammar.generate(params);
if (values.id) level = { ...level, id: values.id };
writeFileSync(values.out, JSON.stringify(level, null, 2) + '\n');
const report = g.levelGrammar.validate(level, g.feelPresets[g.defaultFeel]!);
console.log(JSON.stringify({ out: values.out, ok: report.ok, metrics: report.metrics, issues: report.issues.map((i) => `${i.severity}:${i.code}`) }));
for (const [key, value] of Object.entries(g.extraContent?.(params) ?? {})) {
  const extraOut = values.out.replace(/levels\/[^/]+$/, `${key}.json`);
  writeFileSync(extraOut, JSON.stringify(value, null, 2) + '\n');
  console.log(`wrote ${extraOut}`);
}
