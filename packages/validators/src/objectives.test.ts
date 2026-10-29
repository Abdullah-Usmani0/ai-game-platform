import type { Objectives } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { checkObjectives } from './objectives.js';
import type { EntityRole } from './systems.js';

const roles = new Map<string, Set<EntityRole>>([
  ['wasp', new Set(['hostile'])],
  ['pollen', new Set(['collectible'])],
]);
const rules = (clauses: Objectives['win']['clauses'], lose: Objectives['lose'] = []): Objectives => ({ version: 1, win: { mode: 'all', clauses }, lose });
const codes = (o: Objectives, goal = true) => checkObjectives(o, { roles, goal }).issues.map((i) => i.code);

describe('checkObjectives', () => {
  it('accepts objectives the game can mean', () => {
    expect(codes(rules([{ kind: 'defeat', type: 'wasp', count: 10 }, { kind: 'collect', type: 'pollen', count: 3 }, { kind: 'reach_goal' }]))).toEqual([]);
    expect(codes(rules([{ kind: 'survive', seconds: 45 }], [{ kind: 'lives', count: 3 }]), false)).toEqual([]);
  });

  it('counts only hostiles as defeated and collectibles as collected', () => {
    expect(codes(rules([{ kind: 'defeat', type: 'pollen', count: 3 }]))).toEqual(['objective_type']);
    expect(codes(rules([{ kind: 'collect', type: 'wasp', count: 3 }]))).toEqual(['objective_type']);
    expect(codes(rules([{ kind: 'defeat', type: 'ghost', count: 1 }]))).toEqual(['objective_type']);
    expect(checkObjectives(rules([{ kind: 'collect', count: 1 }]), { roles: new Map(), goal: true }).issues.map((i) => i.code)).toEqual(['objective_type']);
  });

  it('needs a goal tile for reach_goal, and lives for a survival clock', () => {
    expect(codes(rules([{ kind: 'reach_goal' }]), false)).toEqual(['no_goal']);
    expect(codes(rules([{ kind: 'survive', seconds: 45 }]))).toEqual(['free_deaths']);
    expect(codes(rules([{ kind: 'survive', seconds: 45 }], [{ kind: 'time_out', seconds: 60 }]))).toEqual(['free_deaths']);
  });
});
