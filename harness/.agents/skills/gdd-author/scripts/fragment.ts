import { genre } from '@gg/templates/node';
const id = process.argv[2];
if (!id) {
  console.error('usage: fragment.ts <genre>');
  process.exit(2);
}
const g = genre(id);
console.log(g.gddFragment);
console.log('\n## Interview prompts\n' + g.interviewFragment);
