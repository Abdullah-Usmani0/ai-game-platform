import { readFileSync } from 'node:fs';
import { BehaviourFsm } from '@gg/schemas';
const file = process.argv[2];
if (!file) {
  console.error('usage: render-fsm.ts <file.fsm.json>');
  process.exit(2);
}
const fsm = BehaviourFsm.parse(JSON.parse(readFileSync(file, 'utf8')));
console.log(`${fsm.id}: ${fsm.designNotes}`);
for (const [name, st] of Object.entries(fsm.states)) {
  const mark = name === fsm.initial ? '*' : ' ';
  console.log(`${mark} ${name}`);
  if (st.onEnter.length) console.log(`    enter: ${st.onEnter.map((a) => a.kind).join(', ')}`);
  if (st.update.length) console.log(`    update: ${st.update.map((a) => a.kind + ('speed' in a ? `(${a.speed})` : '')).join(', ')}`);
  for (const t of st.transitions) console.log(`    -> ${t.to} when ${JSON.stringify(t.when)}`);
}
