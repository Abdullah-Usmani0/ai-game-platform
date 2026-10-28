import { genre } from '@gg/templates/node';
const [id, tier] = process.argv.slice(2);
if (!id || !tier) {
  console.error('usage: scope-budget.ts <genre> <small|medium|large>');
  process.exit(2);
}
const g = genre(id);
const budget = g.scopeBudget[tier as 'small' | 'medium' | 'large'];
if (!budget) {
  console.error(`unknown tier '${tier}'`);
  process.exit(2);
}
console.log(JSON.stringify(budget));
