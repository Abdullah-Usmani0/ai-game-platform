import type { BehaviourFsm, FreeformSystemsJson, GameEventRecord, LevelJson, SystemsJson } from '@gg/schemas';
import { CELESTE_CLASS } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { validateBehaviour } from './behaviour.js';
import { checkGdd } from './gdd.js';
import { juiceLint, juiceLintRuns, silentSfx } from './juice.js';
import { jumpEnvelope } from './jump-envelope.js';
import { validateLevel, validateRamp } from './level.js';
import { checkSystems, impact, type SystemsCatalog } from './systems.js';

function level(rows: string[], extra: Partial<LevelJson> = {}): LevelJson {
  return {
    version: 1,
    id: 'l',
    name: 'l',
    tileSize: 8,
    width: rows[0]!.length,
    height: rows.length,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal' },
    rows,
    entities: [],
    spawn: { x: 1, y: rows.length - 3 },
    goal: { x: rows[0]!.length - 2, y: rows.length - 3 },
    ...extra,
  };
}

describe('jumpEnvelope', () => {
  it('derives a 3-tile jump and multi-tile horizontal reach from the Celeste preset', () => {
    const env = jumpEnvelope(CELESTE_CLASS, 8);
    expect(env.jumpUpTiles).toBeGreaterThanOrEqual(3);
    expect(env.maxDx.get(0) ?? 0).toBeGreaterThanOrEqual(5);
    expect(env.maxDx.get(-3) ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('validateLevel', () => {
  it('accepts a flat level with a small gap and a one-tile step', () => {
    const rows = [
      '........................',
      '........................',
      '........................',
      '....................##..',
      '..........^^..........G.',
      '##########..############',
      '########################',
    ];
    const r = validateLevel(level(rows, { spawn: { x: 1, y: 4 }, goal: { x: 22, y: 4 } }), { feel: CELESTE_CLASS, safeStartTiles: 6 });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(r.metrics['goalReachable']).toBe(true);
  });

  it('rejects a goal behind a wall taller than the jump', () => {
    const rows = [
      '............#...........',
      '............#...........',
      '............#...........',
      '............#...........',
      '............#.........G.',
      '########################',
      '########################',
    ];
    const r = validateLevel(level(rows, { spawn: { x: 1, y: 4 }, goal: { x: 22, y: 4 } }), { feel: CELESTE_CLASS });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('goal_unreachable');
  });

  it('flags hazards near the spawn and unreachable collectibles', () => {
    const rows = [
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '..^...................G.',
      '########################',
      '########################',
    ];
    // The coin sits five tiles above the floor: beyond a three-tile jump plus the player's reach.
    const r = validateLevel(level(rows, { spawn: { x: 1, y: 5 }, goal: { x: 22, y: 5 }, entities: [{ type: 'coin', x: 11, y: 0, props: {} }] }), { feel: CELESTE_CLASS });
    expect(r.issues.map((i) => i.code)).toContain('hazard_near_spawn');
    expect(r.metrics['unreachableCollectibles']).toBe(1);
  });

  it('validates the ramp', () => {
    expect(validateRamp([{ id: 'a', difficulty: 0.2 }, { id: 'b', difficulty: 0.5 }]).ok).toBe(true);
    expect(validateRamp([{ id: 'a', difficulty: 0.6 }]).ok).toBe(false);
  });
});

describe('validateBehaviour', () => {
  it('warns on unreachable states and errors on vocabulary violations', () => {
    const fsm: BehaviourFsm = {
      version: 1,
      id: 'x',
      designNotes: '',
      initial: 'a',
      states: {
        a: { onEnter: [], update: [{ kind: 'patrol', speed: 20 }], transitions: [{ to: 'b', when: { kind: 'player_within', px: 40 } }] },
        b: { onEnter: [], update: [{ kind: 'shoot', projectile: 'bolt', speed: 100, cooldownMs: 500 }], transitions: [{ to: 'a', when: { kind: 'player_beyond', px: 80 } }] },
        c: { onEnter: [], update: [{ kind: 'idle' }], transitions: [{ to: 'a', when: { kind: 'always' } }] },
      },
    };
    const r = validateBehaviour(fsm, { conditions: ['player_within', 'player_beyond', 'always'], actions: ['patrol', 'idle'] });
    expect(r.issues.map((i) => i.code)).toContain('state_unreachable');
    expect(r.issues.map((i) => i.code)).toContain('action_not_in_vocab');
    expect(r.ok).toBe(false);
  });
});

describe('checkGdd', () => {
  const fm = JSON.stringify({ title: 'Cave Hop', genre: 'platformer', scopeTier: 'small', pillars: ['tight jumps', 'readable hazards', 'short levels'], scope: { levels: 3, enemies: 2, items: 1, bosses: 0 }, targets: { sessionMin: 10, levelTimeS: 60, deathsPerLevel: 3 }, verbs: ['run', 'jump'], feedbackEvents: [{ event: 'jump', channels: ['sfx'] }] });
  const body = ['## Concept', 'x'.repeat(100), '## Pillars', 'y', '## Core loop', 'z'.repeat(100), '## Progression', 'p'.repeat(100), '## Scope', 's', '## Feedback', 'f'.repeat(120)].join('\n');
  it('accepts a complete gdd and rejects a missing section', () => {
    expect(checkGdd(`---\n${fm}\n---\n${body}`).ok).toBe(true);
    const r = checkGdd(`---\n${fm}\n---\n${body.replace('## Feedback', '## Nope')}`);
    expect(r.issues.map((i) => i.code)).toContain('section_missing');
  });
  it('enforces the scope budget', () => {
    const r = checkGdd(`---\n${fm}\n---\n${body}`, { levels: 2, enemies: 2, items: 2, bosses: 0 });
    expect(r.issues.map((i) => i.code)).toContain('scope_over_budget');
  });
});

describe('checkSystems and impact', () => {
  const catalog: SystemsCatalog = {
    'movement-platformer': { id: 'movement-platformer', genres: ['platformer'], required: true, summary: 'm', params: { maxRun: { type: 'number', min: 40, max: 200, default: 90, affects: 'levels' } }, emits: ['jump'], feedbackFor: ['jump', 'land'] },
    pickups: { id: 'pickups', genres: '*', summary: 'p', params: { value: { type: 'number', min: 1, max: 10, default: 1, affects: 'none' } }, emits: ['pickup'], feedbackFor: ['pickup'] },
  };
  const base: SystemsJson = { version: 1, genre: 'platformer', feelPreset: 'celeste-class', systems: [{ id: 'movement-platformer', params: { maxRun: 90 } }, { id: 'pickups', params: {} }] };
  it('validates ids, ranges, required systems and feedback bindings', () => {
    expect(checkSystems(base, catalog).ok).toBe(true);
    const bad: SystemsJson = { ...base, systems: [{ id: 'pickups', params: { value: 99 } }, { id: 'nope', params: {} }] };
    const r = checkSystems(bad, catalog, { feedbackEvents: [{ event: 'hit', channels: ['flash'] }] } as never);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('param_range');
    expect(codes).toContain('unknown_system');
    expect(codes).toContain('required_system_missing');
    expect(codes).toContain('feedback_unbound');
  });
  it("takes a freeform game's systems from every genre, still checking each one", () => {
    const melee = { id: 'melee', genres: ['topdown-action'], required: true, summary: 'x', params: { range: { type: 'number' as const, min: 8, max: 40, default: 14, affects: 'levels' as const } }, emits: [], feedbackFor: [] };
    const mixed: FreeformSystemsJson = { version: 1, genre: 'freeform', composition: { base: 'platformer' }, feelPreset: 'celeste-class', systems: [{ id: 'pickups', params: {} }, { id: 'melee', params: { range: 20 } }] };
    // No wrong-genre system, no required one missing: the composition rules decide what belongs together.
    expect(checkSystems(mixed, { ...catalog, melee }).issues).toEqual([]);
    expect(checkSystems({ ...mixed, systems: [{ id: 'melee', params: { range: 99 } }, { id: 'nope', params: {} }] }, { ...catalog, melee }).issues.map((i) => i.code).sort()).toEqual(['param_range', 'unknown_system']);
    // The same systems in a curated platformer: a top-down system, and the platformer's own movement missing.
    expect(checkSystems({ ...base, systems: mixed.systems }, { ...catalog, melee }).issues.map((i) => i.code).sort()).toEqual(['required_system_missing', 'system_wrong_genre']);
  });
  it('reports what a change invalidates', () => {
    const after: SystemsJson = { ...base, systems: [{ id: 'movement-platformer', params: { maxRun: 120 } }, { id: 'pickups', params: { value: 2 } }] };
    const i = impact(base, after, catalog);
    expect(i.levels).toBe(true);
    expect(i.assets).toBe(false);
    expect(i.changed).toEqual(['movement-platformer.maxRun', 'pickups.value']);
  });
});

describe('juiceLint', () => {
  const gdd = { feedbackEvents: [{ event: 'hit' as const, channels: ['shake' as const] }, { event: 'pickup' as const, channels: ['sfx' as const] }] };
  it('passes when every event has its channel within the window', () => {
    const events: GameEventRecord[] = [
      { tick: 10, name: 'hit', payload: {} },
      { tick: 10, name: 'feedback', payload: { channel: 'shake' } },
      { tick: 50, name: 'pickup', payload: {} },
      { tick: 51, name: 'audio_play', payload: {} },
    ];
    expect(juiceLint(events, gdd).ok).toBe(true);
  });
  it('fails when a hit has no shake', () => {
    const events: GameEventRecord[] = [
      { tick: 10, name: 'hit', payload: {} },
      { tick: 30, name: 'feedback', payload: { channel: 'shake' } },
      { tick: 50, name: 'pickup', payload: {} },
      { tick: 51, name: 'audio_play', payload: {} },
    ];
    const r = juiceLint(events, gdd);
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe('feedback_missing');
  });
});

describe('juiceLintRuns', () => {
  const gdd = { feedbackEvents: [{ event: 'hit', channels: ['shake'] }, { event: 'custom:finisher', channels: ['flash'] }] };
  const hit = (tick: number, answered: boolean): GameEventRecord[] => [{ tick, name: 'hit', payload: {} }, ...(answered ? [{ tick, name: 'feedback', payload: { channel: 'shake' } }] : [])];
  it('lints each seed on its own: feedback from another run never answers an event', () => {
    // Seed 1 hits at 10 unanswered; seed 2 shakes at 10. Merged into one history the hit would look answered.
    const runs = [
      { seed: 1, events: hit(10, false) },
      { seed: 2, events: [{ tick: 10, name: 'feedback', payload: { channel: 'shake' } }, ...hit(40, true)] },
    ];
    expect(juiceLint(runs.flatMap((r) => r.events), gdd).issues.some((i) => i.code === 'feedback_missing')).toBe(false);
    const r = juiceLintRuns(runs, gdd);
    expect(r.ok).toBe(false);
    expect(r.issues.filter((i) => i.code === 'feedback_missing').map((i) => i.message)).toEqual([expect.stringMatching(/^seed 1: 'hit' fired 1x/)]);
  });
  it("checks the genre's custom events, and an event counts as never fired only when no run fired it", () => {
    const runs = [
      { seed: 1, events: [...hit(10, true), { tick: 20, name: 'custom:finisher', payload: {} }] },
      { seed: 2, events: hit(10, true) },
    ];
    const r = juiceLintRuns(runs, gdd);
    expect(r.issues.map((i) => i.message)).toEqual([expect.stringMatching(/^seed 1: 'custom:finisher' fired 1x but 1x had no flash/)]);
    const quiet = juiceLintRuns([{ seed: 1, events: hit(10, true) }, { seed: 2, events: hit(5, true) }], gdd);
    expect(quiet.ok).toBe(true);
    expect(quiet.issues).toEqual([expect.objectContaining({ code: 'event_never_fired', message: "feedback event 'custom:finisher' never occurred in any of 2 runs" })]);
  });
});

describe('silentSfx', () => {
  it('flags sfx bindings for events no sound plays for', () => {
    const sounds: Record<string, string> = { hit: 'hit', 'custom:slam': 'slam' };
    const table = { feedbackEvents: [{ event: 'hit', channels: ['sfx', 'shake'] }, { event: 'spawn', channels: ['sfx'] }, { event: 'custom:slam', channels: ['sfx'] }, { event: 'menu_choose', channels: ['flash'] }] };
    const issues = silentSfx(table, (e) => sounds[e] ?? null);
    expect(issues.map((i) => [i.code, i.severity])).toEqual([['sfx_unresolved', 'error']]);
    expect(issues[0]!.message).toMatch(/^'spawn' is bound to sfx/);
  });
});

describe('jump envelope options', () => {
  it('the default envelope is the plain held jump, unchanged', () => {
    const e = jumpEnvelope(CELESTE_CLASS, 8);
    expect(e.jumpUpTiles).toBe(3);
    expect(e.maxDx.get(0)).toBe(11);
    expect(e.maxDx.get(-3)).toBe(9);
  });
  it('exact air speed is tighter; an air jump doubles the height; the dash reaches furthest', () => {
    const exact = jumpEnvelope(CELESTE_CLASS, 8, 12, { exactAir: true });
    const double = jumpEnvelope(CELESTE_CLASS, 8, 12, { exactAir: true, airJumps: 1 });
    const dash = jumpEnvelope(CELESTE_CLASS, 8, 12, { exactAir: true, dash: true });
    const both = jumpEnvelope(CELESTE_CLASS, 8, 12, { exactAir: true, airJumps: 1, dash: true });
    expect(exact.maxDx.get(0)!).toBeLessThan(jumpEnvelope(CELESTE_CLASS, 8).maxDx.get(0)!);
    expect(double.jumpUpTiles).toBeGreaterThanOrEqual(6);
    expect(dash.jumpUpTiles).toBe(exact.jumpUpTiles);
    expect(dash.maxDx.get(0)!).toBeGreaterThan(double.maxDx.get(0)!);
    expect(both.maxDx.get(0)!).toBeGreaterThan(dash.maxDx.get(0)!);
  });
});
