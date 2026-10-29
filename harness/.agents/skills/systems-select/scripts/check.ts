import { checkGameSystems } from '@gg/templates/node';

// The gate's validate:systems, run by hand: the catalog's ranges and the GDD's events, and for a freeform game the
// composition rules and its objectives.
const r = checkGameSystems('game');
for (const i of r.issues) console.log(`${i.severity}: ${i.code}: ${i.message}`);
console.log(r.ok ? 'OK' : 'FAILED');
process.exit(r.ok ? 0 : 1);
