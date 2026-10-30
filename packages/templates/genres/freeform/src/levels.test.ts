import { describe, expect, it } from 'vitest';
import { HIVE, LANTERN, ROOFTOP } from './examples.js';
import { generatorParams } from './levels.js';

describe('generatorParams', () => {
  it("makes a runner's levels as long as it runs in an expert's share of the level time, and asks nothing for other games", () => {
    // 60% of 30 s is 18 s; at the celeste-class top speed of 90 px/s that is 1620 px, 203 tiles of 8 px.
    expect(generatorParams(ROOFTOP.systems, 30)).toEqual({ length: 203 });
    const faster = { ...ROOFTOP.systems, systems: ROOFTOP.systems.systems.map((s) => (s.id === 'auto-run' ? { ...s, params: { pace: 1.4 } } : s)) };
    expect(generatorParams(faster, 30)).toEqual({ length: 283 });
    expect(generatorParams(ROOFTOP.systems, 300)).toEqual({ length: 400 });
    expect(generatorParams(LANTERN.systems, 30)).toEqual({});
    expect(generatorParams(HIVE.systems, 60)).toEqual({});
  });
});
