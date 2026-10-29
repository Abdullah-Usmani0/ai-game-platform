import type { PlaytestReport } from '@gg/schemas';

/**
 * One summary of smoke runs at several seeds: every seed and bot, every console error and failure (failures prefixed
 * with their seed), the slowest ready time, passed only when every run passed and replays matched everywhere. Event
 * histories cannot be merged (feedback is matched to events by tick within one run), so the summary keeps the first
 * seed's; each seed's own report keeps its history for the juice lint.
 */
export function mergeReports(reports: readonly PlaytestReport[]): PlaytestReport {
  const first = reports[0];
  if (!first) throw new Error('mergeReports needs at least one report');
  if (reports.length === 1) return first;
  const ready = reports.map((r) => r.readyMs).filter((v): v is number => v !== undefined);
  const matches = reports.map((r) => r.replayHashMatch).filter((v): v is boolean => v !== undefined);
  return {
    version: 1,
    createdAt: reports.map((r) => r.createdAt).sort().at(-1)!,
    seeds: reports.flatMap((r) => r.seeds),
    bots: reports.flatMap((r) => r.bots),
    consoleErrors: [...new Set(reports.flatMap((r) => r.consoleErrors))],
    events: first.events,
    ...(ready.length ? { readyMs: Math.max(...ready) } : {}),
    ...(matches.length ? { replayHashMatch: matches.every(Boolean) } : {}),
    passed: reports.every((r) => r.passed),
    failures: reports.flatMap((r) => r.failures.map((f) => `seed ${r.seeds.join('+')}: ${f}`)),
  };
}
