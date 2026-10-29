import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CuratedGenre } from '@gg/schemas';
import type { CatalogSystem } from '@gg/validators';
import { FREEFORM_CATALOG, freeformDesignManifest } from '@gg/template-freeform/node';
import { CATALOG, genre } from '@gg/templates/node';

// `pnpm catalog <genre>`, or `pnpm catalog freeform <base>`: every system a freeform game on that base can use.
const [id, base] = process.argv.slice(2);
// Composed parameters (entity types, switches) are the composition's to set, so the skill never sees them.
const visible = (c: CatalogSystem) => ({ ...c, params: Object.fromEntries(Object.entries(c.params).filter(([, p]) => !p.composed)) });
let payload: Record<string, unknown>;
if (id === 'freeform') {
  const m = base ? freeformDesignManifest(CuratedGenre.parse(base)) : null;
  const systems = m ? Object.values(m.systems).map((s) => s.meta) : Object.values(FREEFORM_CATALOG);
  payload = { genre: 'freeform', base: base ?? null, feelPresets: m ? Object.keys(m.feelPresets) : [], required: [], optional: systems.map((c) => c.id), systems: systems.map(visible) };
} else {
  const entries = Object.values(CATALOG).filter((c) => !id || c.genres === '*' || c.genres.includes(id as never));
  payload = { genre: id ?? '*', feelPresets: id ? Object.keys(genre(id).feelPresets) : [], required: id ? genre(id).requiredSystems : [], optional: id ? genre(id).optionalSystems : [], systems: entries.map(visible) };
}
const out = fileURLToPath(new URL('../catalog.json', import.meta.url));
writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify(payload, null, 2));
