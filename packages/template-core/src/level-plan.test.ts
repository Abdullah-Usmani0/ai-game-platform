import { DEFAULT_SEED, levelSeed } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { ARENA_DIFFICULTY, levelPlan, plannedLevelCount } from './level-plan.js';

describe('levelPlan', () => {
  it('builds exactly one arena for arena grammars, harder in bigger tiers, whatever the scope says', () => {
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(levelPlan('arena', { levels: 3, bosses: 1, tier })).toEqual([{ index: 0, id: 'arena', difficulty: ARENA_DIFFICULTY[tier], boss: 0, seed: DEFAULT_SEED }]);
    }
    expect(plannedLevelCount('arena', 3)).toBe(1);
  });

  it('ramps from 0.15 toward 0.75 by at most 0.2 a level, and plays each level at its own seed', () => {
    expect(levelPlan('tilemap', { levels: 1, bosses: 0, tier: 'small' }).map((l) => l.difficulty)).toEqual([0.25]);
    expect(levelPlan('tilemap', { levels: 2, bosses: 0, tier: 'small' }).map((l) => l.difficulty)).toEqual([0.15, 0.35]);
    expect(levelPlan('rooms', { levels: 4, bosses: 0, tier: 'medium' }).map((l) => l.difficulty)).toEqual([0.15, 0.35, 0.55, 0.75]);
    expect(levelPlan('graph', { levels: 5, bosses: 0, tier: 'large' }).map((l) => l.difficulty)).toEqual([0.15, 0.3, 0.45, 0.6, 0.75]);
    for (let n = 1; n <= 10; n++) {
      const plan = levelPlan('tilemap', { levels: n, bosses: 0, tier: 'large' });
      expect(plan.map((l) => l.id)).toEqual(Array.from({ length: n }, (_, i) => `l${String(i + 1).padStart(2, '0')}`));
      expect(plan.map((l) => l.seed)).toEqual(plan.map((l) => levelSeed(DEFAULT_SEED, l.index)));
      for (let i = 1; i < n; i++) {
        expect(plan[i]!.difficulty).toBeGreaterThan(plan[i - 1]!.difficulty);
        expect(plan[i]!.difficulty - plan[i - 1]!.difficulty).toBeLessThanOrEqual(0.2 + 1e-9);
      }
      expect(plan.at(-1)!.difficulty).toBeLessThanOrEqual(0.75);
    }
  });

  it('puts a boss on the last of two or more levels, never on a single level', () => {
    expect(levelPlan('rooms', { levels: 3, bosses: 1, tier: 'medium' }).map((l) => l.boss)).toEqual([0, 0, 1]);
    expect(levelPlan('rooms', { levels: 3, bosses: 0, tier: 'medium' }).map((l) => l.boss)).toEqual([0, 0, 0]);
    expect(levelPlan('rooms', { levels: 1, bosses: 1, tier: 'small' }).map((l) => l.boss)).toEqual([0]);
  });

  it('keeps the count between one and ten levels', () => {
    expect(levelPlan('tilemap', { levels: 0, bosses: 0, tier: 'small' })).toHaveLength(1);
    expect(levelPlan('tilemap', { levels: 40, bosses: 0, tier: 'large' })).toHaveLength(10);
    expect(plannedLevelCount('tilemap', 40)).toBe(10);
  });
});
