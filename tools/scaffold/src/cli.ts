import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { StyleCard, SystemsJson } from '@gg/schemas';
import { EXAMPLES } from '@gg/template-freeform';
import { DEFAULT_STYLE, defaultSystems, readJson, scaffold, scaffoldExample } from './scaffold.js';

const { values } = parseArgs({
  options: {
    genre: { type: 'string' },
    out: { type: 'string' },
    'game-id': { type: 'string', default: 'game' },
    title: { type: 'string', default: 'Untitled Game' },
    systems: { type: 'string' },
    style: { type: 'string' },
    gdd: { type: 'string' },
    levels: { type: 'string' },
    seed: { type: 'string', default: '1' },
    'no-link': { type: 'boolean', default: false },
    example: { type: 'string' },
  },
});
// One of the freeform example games, as the worker builds it (a showcase: `--example lantern --out <dir>`).
if (values.example) {
  const ex = EXAMPLES.find((e) => e.id === values.example);
  if (!ex || !values.out) {
    console.error(`usage: gg-scaffold --example <${EXAMPLES.map((e) => e.id).join('|')}> --out <dir> [--style style.json] [--seed N] [--no-link]`);
    process.exit(2);
  }
  const result = scaffoldExample(ex, values.out, { seed: Number(values.seed), style: values.style ? readJson<StyleCard>(values.style) : DEFAULT_STYLE, linkNodeModules: !values['no-link'] });
  console.log(JSON.stringify({ outDir: result.outDir, files: result.files.length, levels: result.levels }));
  process.exit(0);
}
if (!values.genre || !values.out || !values.gdd) {
  console.error('usage: gg-scaffold --genre <platformer|survivors> --out <dir> --gdd <gdd.md> [--systems systems.json] [--style style.json] [--game-id id] [--title T] [--levels N] [--seed N] [--no-link]');
  process.exit(2);
}
const systems = values.systems ? readJson<SystemsJson>(values.systems) : defaultSystems(values.genre, ['pickups', 'combat-stomp']);
const style = values.style ? readJson<StyleCard>(values.style) : DEFAULT_STYLE;
const result = scaffold({
  outDir: values.out,
  genre: values.genre,
  gameId: values['game-id'],
  title: values.title,
  systems,
  style,
  gddMarkdown: readFileSync(values.gdd, 'utf8'),
  levels: values.levels ? Number(values.levels) : undefined,
  seed: Number(values.seed),
  linkNodeModules: !values['no-link'],
});
console.log(JSON.stringify({ outDir: result.outDir, files: result.files.length, levels: result.levels }));
