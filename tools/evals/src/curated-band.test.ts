import { readFileSync } from 'node:fs';
import { PLAYABLE_GENRES } from '@gg/schemas';
import { describe, expect, it } from 'vitest';

interface Band {
  n: number;
  p5: number;
  p50: number;
  p95: number;
}
interface Summary {
  levels: number;
  rates: { explorerFound: number; afkWins: number };
  metrics: Record<string, Band | null>;
}
const band = JSON.parse(readFileSync(new URL('../curated-band.json', import.meta.url), 'utf8')) as { overall: Summary; genres: Record<string, Summary> };

/**
 * The calibration is only as good as the curated levels it measured. A curated level that plays itself, or a band with
 * a genre missing, means the band would wave through what it should catch.
 */
describe('curated band', () => {
  it('covers every playable genre', () => {
    expect(Object.keys(band.genres).sort()).toEqual([...PLAYABLE_GENRES].sort());
    for (const [id, g] of Object.entries(band.genres)) expect(g.levels, id).toBeGreaterThanOrEqual(3);
  });

  it('no curated level plays itself, and every measured band is ordered', () => {
    expect(band.overall.rates.afkWins).toBe(0);
    for (const s of [band.overall, ...Object.values(band.genres)]) {
      for (const [name, m] of Object.entries(s.metrics)) {
        if (!m) continue;
        expect(m.p5, name).toBeLessThanOrEqual(m.p50);
        expect(m.p50, name).toBeLessThanOrEqual(m.p95);
      }
    }
  });

  it('every curated level answers its feedback and needs at least one verb', () => {
    expect(band.overall.metrics['feedbackAnswered']!.p5).toBeGreaterThan(0.9);
    expect(band.overall.metrics['verbsNeeded']!.p5).toBeGreaterThanOrEqual(1);
  });
});
