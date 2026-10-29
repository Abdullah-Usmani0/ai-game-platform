import { Rng, type InputSegment } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { explore } from './explore.js';
import { afkWins, feedbackCoverage, jitterRobustness, jitterScript, levelQuality, randomWinRate, rankCorrelation, verbsNeeded, verbsOf } from './quality.js';
import { base, finish, level, platformer, room, runner } from './test-games.js';

/** The pit's run without the pit: nothing to time. */
const flat = base(level(['..............................', '..............................', '..............................', '..............................', '..............................', '.S...........................G', '##############################', '##############################']), [runner, finish], { player: { w: 8, h: 11, hp: 1 } });
/** The goal under the spawn: the level is won before anyone presses a key. */
const trivial = base(level(['....', '....', '....', '....', 'G...', 'S...', '####', '####']), [runner, finish], { player: { w: 8, h: 11, hp: 1 } });

const proofOf = (make: typeof platformer) => {
  const r = explore(make, { budget: 20_000 });
  expect(r.completed).toBe(true);
  return { script: r.script!, ticks: r.ticks };
};

describe('jitterScript', () => {
  it('moves change points by at most the amount, keeps every segment, the inputs and the end', () => {
    const script: InputSegment[] = [
      { from: 0, to: 10, input: { right: true } },
      { from: 10, to: 11, input: { right: true, jump: true } },
      { from: 11, to: 40, input: { left: true } },
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const j = jitterScript(script, 3, new Rng(seed));
      expect(j.map((s) => s.input)).toEqual(script.map((s) => s.input));
      expect(j[0]!.from).toBe(0);
      expect(j.at(-1)!.to).toBe(40);
      for (const [i, s] of j.entries()) {
        expect(s.to).toBeGreaterThan(s.from);
        expect(Math.abs(s.from - script[i]!.from)).toBeLessThanOrEqual(3);
        if (i > 0) expect(s.from).toBe(j[i - 1]!.to);
      }
    }
    expect(jitterScript(script, 3, new Rng(5))).toEqual(jitterScript(script, 3, new Rng(5)));
  });
});

describe('quality measures', () => {
  it('jitter: a run with nothing to time always survives it; a timed jump over spikes does not', () => {
    const f = proofOf(flat);
    expect(jitterRobustness(flat, f.script, f.ticks)).toBe(1);
    const r = proofOf(room);
    expect(jitterRobustness(room, r.script, r.ticks)).toBe(1);
    const p = proofOf(platformer);
    const pit = jitterRobustness(platformer, p.script, p.ticks, { runs: 24 });
    expect(pit).toBeGreaterThan(0);
    expect(pit).toBeLessThan(1);
  });

  it('afk and random play: a level that plays itself is caught, and mashing wins the pit less often than the flat run', () => {
    expect(afkWins(trivial, 600)).toBe(true);
    expect(afkWins(platformer, 1200)).toBe(false);
    expect(randomWinRate(trivial, 600)).toBe(1);
    expect(randomWinRate(platformer, 1200, { runs: 16 })).toBeLessThan(randomWinRate(flat, 1200, { runs: 16 }));
  });

  it('verbs: the pit needs running and jumping, the flat run only running', () => {
    const verbs = { run: ['left', 'right'], jump: ['jump'], dash: ['dash'] } as const;
    expect(verbsNeeded(platformer, verbs, { budget: 8000 })).toEqual({ needed: ['run', 'jump'], optional: ['dash'] });
    expect(verbsNeeded(flat, verbs, { budget: 8000 })).toEqual({ needed: ['run'], optional: ['jump', 'dash'] });
  });

  it("verbsOf groups a game's keys by use, merging uses that share keys, and leaves out undo and restart", () => {
    const topdown = [{ controls: { left: 'move', right: 'move', up: 'move', down: 'move', dash: 'dash' } }, { controls: { action: 'attack', left: 'aim', right: 'aim', up: 'aim', down: 'aim' } }];
    expect(verbsOf(topdown)).toEqual({ dash: ['dash'], attack: ['action'], 'aim/move': ['left', 'right', 'up', 'down'] });
    expect(verbsOf([{ controls: { left: 'step', right: 'step', up: 'step', down: 'step', action: 'undo', dash: 'restart' } }])).toEqual({ step: ['left', 'right', 'up', 'down'] });
  });

  it('feedback coverage counts answered events within the window and salient events with no binding', () => {
    const events = [
      { tick: 1, name: 'hit', payload: {} },
      { tick: 2, name: 'feedback', payload: { channel: 'shake' } },
      { tick: 20, name: 'hit', payload: {} },
      { tick: 40, name: 'pickup', payload: {} },
      { tick: 41, name: 'audio_play', payload: {} },
      { tick: 50, name: 'jump', payload: {} },
    ];
    expect(feedbackCoverage(events, [{ event: 'hit', channels: ['shake'] }, { event: 'pickup', channels: ['sfx'] }])).toEqual({ fired: 3, answered: 2, unbound: ['jump'] });
  });

  it('rank correlation: +1 for a steady rise, -1 for a fall, 0 with nothing to rank', () => {
    expect(rankCorrelation([1, 2, 3, 4])).toBeCloseTo(1);
    expect(rankCorrelation([9, 5, 2, 1])).toBeCloseTo(-1);
    expect(rankCorrelation([3, 3, 3])).toBe(0);
    expect(rankCorrelation([7])).toBe(0);
    expect(rankCorrelation([1, 3, 2, 4])).toBeCloseTo(0.8);
  });

  it('levelQuality measures a level from its proof', () => {
    const p = proofOf(platformer);
    const q = levelQuality(platformer, p, {
      systems: [{ controls: { left: 'run', right: 'run', jump: 'jump', dash: 'dash' } }],
      feedback: [{ event: 'death', channels: ['flash'] }],
      budget: 8000,
    });
    expect(q.proofTicks).toBe(p.ticks);
    expect(q.explorer.found).toBe(true);
    expect(q.afkWins).toBe(false);
    expect(q.verbs).toEqual({ measured: true, needed: ['run', 'jump'], optional: ['dash'] });
    expect(q.jitter).toBeGreaterThanOrEqual(0);
    expect(q.feedback.fired).toBe(0);
  });

  it('levelQuality leaves the verbs unmeasured when the explorer cannot finish the level at all', () => {
    const p = proofOf(platformer);
    const q = levelQuality(platformer, p, { systems: [{ controls: { left: 'run', right: 'run', jump: 'jump', dash: 'dash' } }], feedback: [], budget: 60 });
    expect(q.explorer.found).toBe(false);
    expect(q.verbs).toEqual({ measured: false, needed: [], optional: [] });
  });
});
