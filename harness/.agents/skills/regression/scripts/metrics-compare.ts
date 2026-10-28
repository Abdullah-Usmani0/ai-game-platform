import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const goldenPath = resolve(process.argv[2] ?? 'game/reports/goldens/golden.json');
const reportPath = resolve(process.argv[3] ?? 'game/reports/playtest-report.json');
if (!existsSync(goldenPath)) {
  console.log('no golden; nothing to compare');
  process.exit(0);
}
const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const bot = report.bots?.[0] ?? {};
const problems: string[] = [];
if ((bot.crashes?.length ?? 0) > 0) problems.push(`crashes: ${bot.crashes.length}`);
if (golden.completed && !bot.completed) problems.push('solver completion regressed');
if (golden.metrics?.frameMsP95 && bot.metrics?.frameMsP95 > golden.metrics.frameMsP95 * 1.1 + 1) problems.push(`frameMsP95 ${bot.metrics.frameMsP95} > ${golden.metrics.frameMsP95} x1.1`);
console.log(JSON.stringify({ golden: golden.metrics, current: bot.metrics, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
