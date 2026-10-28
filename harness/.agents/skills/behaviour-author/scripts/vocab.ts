import { genre } from '@gg/templates/node';
const id = process.argv[2];
if (!id) {
  console.error('usage: vocab.ts <genre>');
  process.exit(2);
}
const g = genre(id);
console.log(JSON.stringify({ conditions: g.behaviourVocab.conditions, actions: g.behaviourVocab.actions, entityTypes: g.entityDefs.map((e) => ({ type: e.type, fsm: e.fsm ?? null })), examples: g.defaultBehaviours }, null, 2));
