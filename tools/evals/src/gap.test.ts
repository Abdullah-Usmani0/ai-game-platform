import { readFileSync } from 'node:fs';
import { catalogFor } from '@gg/templates/node';
import { describe, expect, it } from 'vitest';
import { gapReport, MECHANICS, type Idea } from './gap.js';

const catalog = catalogFor({ genre: 'freeform' });

describe('the mechanic-gap report', () => {
  it('counts the ideas the catalog builds whole, and orders the missing mechanics by the ideas each makes whole', () => {
    const ideas: Idea[] = [
      { id: 'a', prompt: 'a platformer', needs: ['move-side', 'collect', 'reach-goal'] },
      { id: 'b', prompt: 'a flapper', needs: ['move-side', 'flap', 'hazards'] },
      { id: 'c', prompt: 'a racer', needs: ['move-vehicle', 'laps'] },
      { id: 'd', prompt: 'a delivery rush', needs: ['move-topdown', 'carry-deliver'] },
      { id: 'e', prompt: 'a courier', needs: ['move-vehicle', 'carry-deliver'] },
    ];
    const r = gapReport(ideas, catalog);
    expect(r.buildable).toEqual(['a']);
    expect(r.missing.find((g) => g.mechanic === 'carry-deliver')).toEqual({ mechanic: 'carry-deliver', askedBy: 2, completes: 1 });
    expect(r.missing.find((g) => g.mechanic === 'laps')).toMatchObject({ askedBy: 1, completes: 0 });
    // Each of the first three makes one idea whole: the tie goes to the one more ideas ask for (carry-deliver, then the
    // vehicle, which the courier now needs alone), then flapping; laps make the racer whole last.
    expect(r.plan.map((p) => p.mechanic)).toEqual(['carry-deliver', 'move-vehicle', 'flap', 'laps']);
    expect(r.plan.at(-1)!.buildable).toBe(5);
  });

  it('refuses a need it has no name for, and a covering system the catalog has not got', () => {
    expect(() => gapReport([{ id: 'x', prompt: 'x', needs: ['time-travel'] }], catalog)).toThrow(/'time-travel', which is not a known mechanic/);
    expect(() => gapReport([], { 'movement-topdown': {} })).toThrow(/names system '.+', which the catalog has not got/);
  });

  it('labels every idea in ideas.json with known mechanics, each covered by a system the catalog has', () => {
    const ideas = (JSON.parse(readFileSync(new URL('../ideas.json', import.meta.url), 'utf8')) as { ideas: Idea[] }).ideas;
    const r = gapReport(ideas, catalog);
    expect(r.ideas).toBe(ideas.length);
    expect(new Set(ideas.map((i) => i.id)).size).toBe(ideas.length);
    expect(r.buildable.length).toBeGreaterThan(10);
    for (const by of Object.values(MECHANICS)) for (const s of by) expect(s.startsWith('@') || s in catalog, s).toBe(true);
  });
});
