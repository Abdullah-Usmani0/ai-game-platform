import type { LevelJson } from '@gg/schemas';
import { CELESTE_CLASS, createSim, emptyInput, sinCosDeg, type InputState, type Sim } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { driveToward, goToward } from './navigate.js';
import { HANDLING, HEADING, VEHICLE, vehicle, VEHICLE_KINDS, type VehicleKind } from './systems/vehicle.js';
import { level } from './test-games.js';

/** An open lot inside a wall, the spawn at its west end: room to reach top speed and coast to a stop. */
function lot(spawn: [number, number] = [4, 20], goal?: [number, number]): LevelJson {
  const rows = Array.from({ length: 40 }, (_, y) => Array.from({ length: 120 }, (_, x) => (x === 0 || y === 0 || x === 119 || y === 39 ? '#' : x === spawn[0] && y === spawn[1] ? 'S' : goal && x === goal[0] && y === goal[1] ? 'G' : '.')).join(''));
  return level(rows);
}

/** A sim of the lot with the vehicle, and every event it emits kept in `heard`. */
const drive = (kind: VehicleKind, params: Record<string, unknown> = {}, lvl = lot()): Sim & { heard: string[] } => {
  const sim = createSim({ feel: CELESTE_CLASS, systems: [vehicle], level: lvl, seed: 1, entityDefs: [], player: { w: 8, h: 8, hp: 3 }, movementMode: 'topdown', params: { 'movement-vehicle': { kind, ...params } } });
  const heard: string[] = [];
  sim.events.on('*', (ev) => heard.push(ev.name));
  return Object.assign(sim, { heard });
};
const hold = (sim: Sim, keys: Partial<InputState>, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step({ ...emptyInput(), ...keys });
};
const speed = (sim: Sim) => Math.hypot(sim.world.player.vx, sim.world.player.vy);
const heading = (sim: Sim) => Number(sim.world.player.props[HEADING]);
/** The angle between where it points and where it goes, in degrees: how wide it drifts. */
const slip = (sim: Sim) => {
  const [s, c] = sinCosDeg(heading(sim));
  const p = sim.world.player;
  return (Math.abs(Math.atan2(-p.vx * s + p.vy * c, p.vx * c + p.vy * s)) * 180) / Math.PI;
};

describe('movement-vehicle', () => {
  it('each kind reaches its top speed on the throttle, along its heading, and coasts to a stop', () => {
    for (const kind of VEHICLE_KINDS) {
      const sim = drive(kind);
      expect(heading(sim)).toBe(0);
      hold(sim, { up: true }, 180);
      expect(speed(sim), kind).toBeCloseTo(HANDLING[kind].top, 3);
      expect(sim.world.player.vy).toBe(0);
      hold(sim, {}, 360);
      expect(speed(sim), kind).toBe(0);
    }
  });

  it('turns harder the faster it goes; a bike cannot turn standing still, a boat swings round slowly', () => {
    const bike = drive('bike');
    const boat = drive('boat');
    hold(bike, { right: true }, 30);
    hold(boat, { right: true }, 30);
    expect(heading(bike)).toBe(0);
    expect(heading(boat)).toBeCloseTo(HANDLING.boat.turn * HANDLING.boat.rest * 0.5, 6);
    // At speed, the full turn: a quarter of a second of steering.
    const fast = drive('car');
    hold(fast, { up: true }, 120);
    hold(fast, { up: true, right: true }, 15);
    expect(heading(fast)).toBeCloseTo(HANDLING.car.turn * 0.25, 6);
    hold(fast, { up: true, left: true }, 15);
    expect(heading(fast)).toBeCloseTo(0, 6);
  });

  it('grip: a bike corners on rails, a boat drifts wide through the same turn', () => {
    const turn = (kind: VehicleKind) => {
      const sim = drive(kind);
      hold(sim, { up: true }, 150);
      hold(sim, { up: true, right: true }, 20);
      return slip(sim);
    };
    expect(turn('bike')).toBeLessThan(5);
    expect(turn('boat')).toBeGreaterThan(20);
    expect(turn('galleon')).toBeGreaterThan(turn('car'));
  });

  it('brakes to a stop, then backs up at its reverse speed, the wheel turning it the other way', () => {
    const sim = drive('car');
    hold(sim, { up: true }, 120);
    let stopped = -1;
    for (let t = 0; t < 120 && stopped < 0; t++) {
      hold(sim, { down: true }, 1);
      if (speed(sim) === 0) stopped = t;
    }
    // From top speed to rest at the brake's rate.
    expect(stopped).toBeGreaterThan(0);
    expect(stopped).toBeLessThanOrEqual(Math.ceil((HANDLING.car.top / HANDLING.car.brake) * 60));
    hold(sim, { down: true }, 180);
    expect(sim.world.player.vx).toBeCloseTo(-HANDLING.car.top * HANDLING.car.reverse, 3);
    hold(sim, { down: true, right: true }, 10);
    expect(heading(sim)).toBeGreaterThan(180);
  });

  it('a wall stops it and costs speed; a hard hit is a bump, a nudge is not', () => {
    const bumps = (sim: { heard: string[] }) => sim.heard.filter((e) => e === 'custom:bump').length;
    const hard = drive('car', {}, lot([100, 20]));
    hold(hard, { up: true }, 90);
    expect(hard.world.player.vx).toBe(0);
    expect(hard.world.player.x).toBeLessThan(119 * 8 - 8 + 0.01);
    expect(bumps(hard)).toBe(1);
    // A touch of throttle a tile from the wall: it rolls into it slowly.
    const soft = drive('car', {}, lot([117, 20]));
    hold(soft, { up: true }, 10);
    hold(soft, {}, 60);
    expect(soft.world.player.x).toBeGreaterThan(119 * 8 - 8 - 0.01);
    expect(soft.world.player.vx).toBe(0);
    expect(bumps(soft)).toBe(0);
  });

  it('boosts past top speed for a moment with boost on, then eases back; without it the dash does nothing', () => {
    const on = drive('bike', { boost: true });
    hold(on, { up: true }, 120);
    hold(on, { up: true, dash: true }, 1);
    hold(on, { up: true }, 20);
    expect(speed(on)).toBeGreaterThan(HANDLING.bike.top * 1.3);
    expect(on.heard.filter((e) => e === 'dash')).toHaveLength(1);
    hold(on, { up: true }, 120);
    expect(speed(on)).toBeCloseTo(HANDLING.bike.top, 3);
    const off = drive('bike');
    hold(off, { up: true }, 120);
    hold(off, { up: true, dash: true }, 21);
    expect(speed(off)).toBeCloseTo(HANDLING.bike.top, 3);
    expect(off.heard).not.toContain('dash');
  });

  it('starts facing the goal, square to the walls', () => {
    expect(heading(drive('car', {}, lot([60, 30], [60, 5])))).toBe(270);
    expect(heading(drive('car', {}, lot([10, 30], [50, 5])))).toBe(315);
    expect(heading(drive('car', {}, lot([60, 20], [20, 20])))).toBe(180);
  });

  it('plays the same every time, and a save taken in mid-turn plays on the same', () => {
    const script = (sim: Sim, from: number, to: number) => {
      for (let t = from; t < to; t++) sim.step({ ...emptyInput(), up: t % 90 < 70, right: t % 40 < 15, left: t % 130 > 110, down: t % 200 > 185 });
    };
    const a = drive('boat');
    const b = drive('boat');
    script(a, 0, 600);
    script(b, 0, 600);
    expect(a.hash()).toBe(b.hash());
    const c = drive('boat');
    script(c, 0, 300);
    const saved = c.save();
    const d = drive('boat');
    d.load(saved);
    script(d, 300, 600);
    expect(d.hash()).toBe(a.hash());
  });
});

describe('driving bots', () => {
  /** The lot with a wall across its middle and a gap at its south end: the way to the east side runs round it. */
  function walled(): LevelJson {
    const rows = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 120 }, (_, x) => (x === 0 || y === 0 || x === 119 || y === 39 || (x === 60 && y < 30) ? '#' : x === 4 && y === 8 ? 'S' : '.')).join(''),
    );
    return level(rows);
  }

  it('each kind drives round a wall to a spot on the far side, and stops there', () => {
    for (const kind of VEHICLE_KINDS) {
      const sim = drive(kind, {}, walled());
      expect(sim.world.player.props[VEHICLE]).toBe(kind);
      const spot = { x: 100 * 8, y: 8 * 8, w: 8, h: 8 };
      const mem: Record<string, number> = {};
      let at = -1;
      for (let t = 0; t < 60 * 40 && at < 0; t++) {
        const input = emptyInput();
        goToward(sim, spot, input, sim.tick, mem, 4);
        sim.step(input);
        const p = sim.world.player;
        if (Math.abs(p.x - spot.x) < 16 && Math.abs(p.y - spot.y) < 16) at = t;
      }
      expect(at, kind).toBeGreaterThan(0);
      // Arrived, it brakes rather than overshooting off into the lot.
      for (let t = 0; t < 120; t++) {
        const input = emptyInput();
        driveToward(sim, spot, input, sim.tick, mem, 4);
        sim.step(input);
      }
      expect(speed(sim), kind).toBeLessThan(HANDLING[kind].top * 0.3);
    }
  });

  it('backs out when it has driven nose first into a wall', () => {
    const sim = drive('car', {}, walled());
    // Driven hard into the wall, then asked for a spot behind it.
    hold(sim, { up: true }, 120);
    const before = sim.world.player.x;
    const mem: Record<string, number> = {};
    const spot = { x: 4 * 8, y: 30 * 8, w: 8, h: 8 };
    let backed = false;
    for (let t = 0; t < 600; t++) {
      const input = emptyInput();
      driveToward(sim, spot, input, sim.tick, mem, 4);
      if (input.down && sim.world.player.x < before) backed = true;
      sim.step(input);
    }
    expect(backed).toBe(true);
    expect(Math.hypot(sim.world.player.x - spot.x, sim.world.player.y - spot.y)).toBeLessThan(24);
  });
});

