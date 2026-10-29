import { describe, expect, it } from 'vitest';
import { checkComposition, deathRule, deathSwitches } from './composition.js';
import type { CatalogSystem } from './systems.js';

const sys = (id: string, over: Partial<CatalogSystem> = {}): CatalogSystem => ({ id, genres: '*', summary: id, params: {}, emits: [], feedbackFor: [], ...over });
const run = sys('run', { provides: { movement: 'platformer' }, controls: { left: 'run', right: 'run', jump: 'jump' } });
const walk = sys('walk', { provides: { movement: 'topdown' }, controls: { left: 'move', right: 'move', up: 'move', down: 'move' } });
const goal = sys('goal', { provides: { win: 'reach_goal' } });
const clock = sys('clock', { provides: { win: 'survive', death: 'game_over' } });
const spikes = sys('spikes', { provides: { death: 'respawn' }, requires: { movement: ['platformer'] } });
const stomp = sys('stomp', { provides: { combat: 'stomp' }, requires: { movement: ['platformer'], roles: ['hostile'] } });
const sword = sys('sword', { provides: { combat: 'melee' }, requires: { movement: ['topdown'], roles: ['hostile'] }, controls: { action: 'attack', left: 'aim', right: 'aim' } });
const gun = sys('gun', { provides: { combat: 'shoot' }, controls: { action: 'shoot' } });
const waves = sys('waves', { provides: { spawns: ['waves'] }, requires: { content: ['waves'] } });
const ok = { roles: ['hostile', 'collectible'] as const, content: ['waves'] };
const codes = (systems: CatalogSystem[], ctx: { roles: Iterable<'hostile' | 'collectible' | 'crate'>; content: Iterable<string> } = ok) => checkComposition(systems, ctx).issues.map((i) => i.code).sort();

describe('checkComposition', () => {
  it('accepts a coherent game: one movement, one win, one death rule, every need met', () => {
    expect(codes([run, goal, spikes, stomp])).toEqual([]);
    expect(codes([walk, clock, sword, waves])).toEqual([]);
  });

  it('needs exactly one movement and exactly one win', () => {
    expect(codes([goal, spikes])).toEqual(['no_movement']);
    // Two movements also claim the same arrows twice.
    expect(codes([run, walk, goal, spikes])).toEqual(['key_twice', 'key_twice', 'two_movements']);
    expect(codes([run, spikes])).toEqual(['no_win']);
    expect(codes([walk, goal, clock])).toEqual(['two_wins']);
  });

  it('needs one death rule when hostiles can hurt, and never two', () => {
    expect(codes([walk, goal])).toEqual(['no_death_rule']);
    expect(codes([walk, goal], { roles: [], content: [] })).toEqual([]);
    expect(codes([run, clock, spikes])).toEqual(['two_death_rules']);
  });

  it('lets a death rule with a switch yield to one without, and names the switches to turn off', () => {
    const pits = sys('pits', { provides: { death: 'respawn', deathSwitch: 'respawn' }, requires: { movement: ['platformer'] } });
    const lives = sys('lives', { provides: { win: 'objectives', death: 'lives' } });
    expect(codes([run, lives, pits, stomp])).toEqual([]);
    expect(deathRule([run, lives, pits]).owner?.id).toBe('lives');
    expect(deathSwitches([run, lives, pits, stomp])).toEqual({ pits: { respawn: false } });
    // Alone, a switchable rule stands; two rules without switches still clash.
    expect(deathRule([run, goal, pits]).owner?.id).toBe('pits');
    expect(deathSwitches([run, goal, pits])).toEqual({});
    expect(codes([run, clock, lives, pits])).toEqual(['two_death_rules', 'two_wins']);
  });

  it("checks each system's needs: its movement, the roles and content it uses, its conflicts", () => {
    expect(codes([walk, goal, clock, stomp])).toEqual(['movement_mismatch', 'two_wins']);
    expect(codes([run, goal, spikes, stomp], { roles: ['collectible'], content: [] })).toEqual(['missing_role']);
    expect(codes([walk, clock, waves], { roles: ['hostile'], content: [] })).toEqual(['missing_content']);
    expect(codes([run, goal, spikes, sys('lonely', { conflicts: ['spikes'] })])).toEqual(['conflict']);
  });

  it('gives every key one use; aiming may share the movement keys', () => {
    expect(codes([walk, clock, sword])).toEqual([]);
    const both = checkComposition([walk, clock, sword, gun], ok);
    expect(both.issues.map((i) => i.code)).toEqual(['key_twice']);
    expect(both.issues[0]!.message).toBe('the action key would attack (sword) and shoot (gun)');
  });
});
