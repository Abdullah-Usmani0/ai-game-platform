import { createSim, emptyInput, type InputState } from '@gg/sdk';
import { runBot, validateWaves } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { generateWaves } from './level/generate.js';
import { shmup } from './node.js';
import { playerShooter } from './systems/player-shooter.js';

function simFor(seed: number, difficulty: number, winAtS = 40) {
  const level = shmup.levelGrammar.generate({ seed: 1, difficulty });
  return createSim({
    level,
    feel: shmup.feelPresets[shmup.defaultFeel]!,
    seed,
    systems: Object.values(shmup.systems).map((m) => m.create()),
    entityDefs: shmup.entityDefs,
    player: shmup.player,
    behaviours: shmup.defaultBehaviours,
    params: { survival: { winAtS } },
    content: { waves: generateWaves({ seed: 1, difficulty }, winAtS) },
    movementMode: 'topdown',
  });
}

describe('shmup template', () => {
  it('the sky validates and the waves pass the pressure check', () => {
    const level = shmup.levelGrammar.generate({ seed: 3, difficulty: 0.5 });
    expect(shmup.levelGrammar.validate(level, shmup.feelPresets['arcade-ship']!).ok).toBe(true);
    const waves = generateWaves({ seed: 1, difficulty: 0.5 }, 60);
    expect(waves.waves.some((w) => w.spawns.some((s) => s.enemy === 'power'))).toBe(true);
    const r = validateWaves(waves, { drone: 2, tank: 6, power: 0 }, 4, 60);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('the dodger survives easy runs with kills; afk dies; the chaos bot is deterministic', () => {
    let wins = 0;
    for (const seed of [1, 2, 3, 4]) {
      const r = runBot(simFor(seed, 0.2), shmup.bots['dodger']!, 60 * 60);
      if (r.completed) wins++;
      expect(r.events['hit']).toBeGreaterThan(0);
    }
    expect(wins).toBeGreaterThanOrEqual(3);
    const afk = runBot(simFor(1, 0.6), shmup.bots['afk']!, 60 * 60);
    expect(afk.completed).toBe(false);
    const a = runBot(simFor(7, 0.5), shmup.bots['chaos']!, 1200);
    const b = runBot(simFor(7, 0.5), shmup.bots['chaos']!, 1200);
    expect(a.finalHash).toBe(b.finalHash);
  });
});

/** The shooter alone in the sky, a drone standing where given (in tiles from the player's), moving as the mode says. */
function aimSim(params: Record<string, string | number>, opts: { mode?: 'topdown' | 'platformer'; foe?: { dx: number; dy: number } } = {}) {
  const level = shmup.levelGrammar.generate({ seed: 1, difficulty: 0.3 });
  const foe = opts.foe ? [{ type: 'drone', x: level.spawn.x + opts.foe.dx, y: level.spawn.y + opts.foe.dy, props: {} }] : [];
  return createSim({
    level: { ...level, entities: foe },
    feel: shmup.feelPresets[shmup.defaultFeel]!,
    seed: 1,
    systems: [playerShooter],
    entityDefs: shmup.entityDefs,
    player: shmup.player,
    behaviours: [],
    params: { 'player-shooter': params },
    content: {},
    movementMode: opts.mode ?? 'topdown',
  });
}

/** Fires once (holding the keys given), returns the volley's velocities, rounded, and waits out the cooldown. */
function volley(sim: ReturnType<typeof aimSim>, held: Partial<InputState> = {}): Array<[number, number]> {
  const before = new Set(sim.world.entities.map((e) => e.id));
  sim.step({ ...emptyInput(), ...held, action: true });
  const shots = sim.world.entities.filter((e) => e.type === 'shot' && !before.has(e.id)).map((e): [number, number] => [Math.round(e.vx), Math.round(e.vy)]);
  for (let i = 0; i < 12; i++) sim.step({ ...emptyInput(), ...held });
  return shots;
}

describe('player-shooter aim', () => {
  it("'up' fires straight up, as the vertical shooter always has", () => {
    expect(volley(aimSim({}, { foe: { dx: 8, dy: 0 } }))).toEqual([[0, -220]]);
    expect(volley(aimSim({ spread: 3 }))).toEqual([[-40, -220], [0, -220], [40, -220]]);
  });

  it("'nearest' fires at the closest hostile within range, else forward", () => {
    const [[vx, vy]] = volley(aimSim({ aim: 'nearest' }, { foe: { dx: 8, dy: 0 } })) as [[number, number]];
    expect(vx).toBeGreaterThan(210);
    expect(Math.abs(vy)).toBeLessThan(30);
    const [[ux, uy]] = volley(aimSim({ aim: 'nearest' }, { foe: { dx: -3, dy: -6 } })) as [[number, number]];
    expect(ux).toBeLessThan(0);
    expect(uy).toBeLessThan(-150);
    // Out of range: the way the player faces.
    expect(volley(aimSim({ aim: 'nearest', range: 48 }, { foe: { dx: 8, dy: 0 } }))).toEqual([[220, 0]]);
  });

  it("'facing' fires where the arrows last pointed top-down, and forward or up in a side view", () => {
    const top = aimSim({ aim: 'facing' });
    expect(volley(top)).toEqual([[0, -220]]);
    expect(volley(top, { left: true, down: true })).toEqual([[-156, 156]]);
    // The aim stays where the arrows left it.
    expect(volley(top)).toEqual([[-156, 156]]);
    const side = aimSim({ aim: 'facing' }, { mode: 'platformer' });
    expect(volley(side)).toEqual([[220, 0]]);
    expect(volley(side, { up: true })).toEqual([[0, -220]]);
    expect(volley(side, { up: true, right: true })).toEqual([[156, -156]]);
  });

  it('fans an aimed spread around the aim', () => {
    const shots = volley(aimSim({ aim: 'nearest', spread: 3 }, { foe: { dx: 8, dy: 0 } }));
    expect(shots).toHaveLength(3);
    expect(shots[0]![1]).toBeLessThan(shots[1]![1]);
    expect(shots[2]![1]).toBeGreaterThan(shots[1]![1]);
  });
});
