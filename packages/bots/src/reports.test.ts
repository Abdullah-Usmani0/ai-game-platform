import type { PlaytestReport } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { mergeReports } from './reports.js';

const run = (seed: number, over: Partial<PlaytestReport> = {}): PlaytestReport => ({
  version: 1,
  createdAt: `2026-10-29T10:00:0${seed}.000Z`,
  seeds: [seed],
  bots: [{ bot: 'runner-script', seed, ticks: 600, completed: true, deaths: 0, stuckMaxTicks: 0, crashes: [], finalHash: `h${seed}`, metrics: { frameMsP95: 10 + seed } }],
  consoleErrors: [],
  events: [{ tick: seed, name: 'hit', payload: {} }],
  readyMs: 100 * seed,
  replayHashMatch: true,
  passed: true,
  failures: [],
  ...over,
});

describe('mergeReports', () => {
  it('keeps every seed and bot, the slowest ready time and the first seed history', () => {
    const m = mergeReports([run(1), run(2), run(3)]);
    expect(m.seeds).toEqual([1, 2, 3]);
    expect(m.bots.map((b) => b.seed)).toEqual([1, 2, 3]);
    expect(m.readyMs).toBe(300);
    expect(m.events).toEqual(run(1).events);
    expect(m.createdAt).toBe(run(3).createdAt);
    expect(m.passed).toBe(true);
  });

  it('fails when any run failed or any replay diverged, and names the seed of each failure', () => {
    const m = mergeReports([run(1), run(2, { passed: false, failures: ['ready flag never set'], replayHashMatch: false, consoleErrors: ['boom'] })]);
    expect(m.passed).toBe(false);
    expect(m.replayHashMatch).toBe(false);
    expect(m.failures).toEqual(['seed 2: ready flag never set']);
    expect(m.consoleErrors).toEqual(['boom']);
  });

  it('joins what each run could not draw: every design that fell back, every placeholder type', () => {
    const m = mergeReports([
      run(1, { draws: { designs: 3, designFallbacks: ['wasp'], blobFallbacks: [] } }),
      run(2, { draws: { designs: 3, designFallbacks: ['wasp'], blobFallbacks: ['spark'] } }),
      run(3),
    ]);
    expect(m.draws).toEqual({ designs: 3, designFallbacks: ['wasp'], blobFallbacks: ['spark'] });
    expect(mergeReports([run(1), run(2)]).draws).toBeUndefined();
  });

  it('a single report is returned as it is', () => {
    const one = run(1);
    expect(mergeReports([one])).toBe(one);
    expect(() => mergeReports([])).toThrow();
  });
});
