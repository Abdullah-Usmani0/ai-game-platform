import { approach, defineSystem, sinCosDeg, type SimCtx } from '@gg/sdk';

/** The player's heading, on its props, in degrees: 0 faces east and 90 south (y runs down the screen). */
export const HEADING = 'heading';
/** The kind of vehicle the player drives, on its props: what the view draws and the setting it is drawn in (a boat sails). */
export const VEHICLE = 'vehicle';

export const VEHICLE_KINDS = ['bike', 'car', 'boat', 'galleon'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

/**
 * How a vehicle handles. Speeds are pixels a second and turning degrees a second. A vehicle turns hardest from a third
 * of its top speed up, and keeps `rest` of that turn standing still (a boat swings round at anchor, a bike cannot).
 * Grip is the share of its side slip shed each tick: a bike corners on rails, a boat drifts wide. It backs up at
 * `reverse` of its top speed.
 */
export interface Handling {
  top: number;
  accel: number;
  brake: number;
  drag: number;
  turn: number;
  rest: number;
  grip: number;
  reverse: number;
}

export const HANDLING: Readonly<Record<VehicleKind, Handling>> = {
  bike: { top: 110, accel: 300, brake: 420, drag: 110, turn: 250, rest: 0, grip: 0.5, reverse: 0.35 },
  car: { top: 140, accel: 230, brake: 380, drag: 80, turn: 200, rest: 0, grip: 0.3, reverse: 0.4 },
  boat: { top: 85, accel: 120, brake: 140, drag: 45, turn: 130, rest: 0.3, grip: 0.07, reverse: 0.3 },
  galleon: { top: 70, accel: 80, brake: 100, drag: 35, turn: 95, rest: 0.35, grip: 0.05, reverse: 0.25 },
};

/** A boost (dash, with boost on) lifts top speed and the throttle this much for BOOST_TICKS, then cools down. */
const BOOST = 1.6;
const BOOST_TICKS = 24;
const BOOST_COOLDOWN = 90;
/** Hitting a wall faster than this share of top speed is a bump, heard and felt. */
const BUMP = 0.45;

interface VehicleState {
  prevDash: boolean;
  boost: number;
  cooldown: number;
}

/** A game's vehicle kind (a car when it names none it knows). */
export function vehicleKind(params: Readonly<Record<string, unknown>> | undefined): VehicleKind {
  const kind = String(params?.['kind'] ?? 'car');
  return (VEHICLE_KINDS as readonly string[]).includes(kind) ? (kind as VehicleKind) : 'car';
}

/** Where the vehicle faces at the start: toward the goal when the level has one some way off, else east. */
function startHeading(ctx: Pick<SimCtx, 'map'>): number {
  const { spawn, goal } = ctx.map.level;
  const dx = goal.x - spawn.x;
  const dy = goal.y - spawn.y;
  if (Math.abs(dx) + Math.abs(dy) < 4) return 0;
  // The nearest of the eight compass points, so a level starts square to its walls.
  const d = Math.SQRT1_2;
  const dirs: Array<[number, number, number]> = [[1, 0, 0], [d, d, 45], [0, 1, 90], [-d, d, 135], [-1, 0, 180], [-d, -d, 225], [0, -1, 270], [d, -d, 315]];
  let best = dirs[0]!;
  for (const dir of dirs) if (dir[0] * dx + dir[1] * dy > best[0] * dx + best[1] * dy) best = dir;
  return best[2];
}

/**
 * A vehicle seen from above: left and right steer, up is the throttle, down brakes and then backs up, and dash boosts
 * (with boost on). The velocity is split along the heading and across it: the throttle, braking and drag work along
 * it, and grip wears the slip across it away, so the faster and looser the vehicle the wider it drifts through a turn.
 * Walls stop it the way it was going and cost it speed; a hard hit is a bump.
 */
export const vehicle = defineSystem<VehicleState>({
  id: 'movement-vehicle',
  init(ctx) {
    const p = ctx.world.player;
    p.props[HEADING] = startHeading(ctx);
    p.props[VEHICLE] = vehicleKind(ctx.params);
    p.facing = sinCosDeg(Number(p.props[HEADING]))[1] < 0 ? -1 : 1;
    return { prevDash: false, boost: 0, cooldown: 0 };
  },
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    const h = HANDLING[vehicleKind(ctx.params)];
    const dt = ctx.dt;
    if (input.dash && !s.prevDash && ctx.params['boost'] === true && s.cooldown === 0) {
      s.boost = BOOST_TICKS;
      s.cooldown = BOOST_COOLDOWN;
      ctx.emit('dash', { x: p.x, y: p.y });
    }
    s.prevDash = input.dash;
    const boosting = s.boost > 0;
    if (s.boost > 0) s.boost--;
    if (s.cooldown > 0) s.cooldown--;
    // Steering turns harder with speed; backing up, the wheel turns it the other way.
    let heading = Number(p.props[HEADING] ?? 0);
    const [s0, c0] = sinCosDeg(heading);
    const going = p.vx * c0 + p.vy * s0;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const turning = h.rest + (1 - h.rest) * Math.min(1, Math.abs(going) / (h.top / 3));
    heading += steer * h.turn * turning * dt * (going < -1 ? -1 : 1);
    heading = ((heading % 360) + 360) % 360;
    p.props[HEADING] = heading;
    const [sn, cs] = sinCosDeg(heading);
    let along = p.vx * cs + p.vy * sn;
    let across = -p.vx * sn + p.vy * cs;
    const top = h.top * (boosting ? BOOST : 1);
    if (input.up && !input.down) along = along < 0 ? Math.min(0, along + h.brake * dt) : along < top ? Math.min(top, along + h.accel * (boosting ? BOOST : 1) * dt) : along;
    else if (input.down && !input.up) along = along > 0 ? Math.max(0, along - h.brake * dt) : Math.max(-h.top * h.reverse, along - h.accel * 0.5 * dt);
    else along = approach(along, 0, h.drag * dt);
    // Out of a boost it coasts back down to its top speed.
    if (along > top) along = Math.max(top, along - h.drag * dt);
    across *= 1 - h.grip;
    p.vx = along * cs - across * sn;
    p.vy = along * sn + across * cs;
    p.facing = cs < 0 ? -1 : 1;
    const vx = p.vx;
    const vy = p.vy;
    ctx.move(p, vx * dt, vy * dt);
    // A wall stops it the way it was going (the move takes that speed), and scrapes some of the rest away.
    const impact = Math.max(p.hitWall ? Math.abs(vx) : 0, vy !== 0 && p.vy === 0 ? Math.abs(vy) : 0);
    if (impact > 0) {
      p.vx *= 0.8;
      p.vy *= 0.8;
      if (impact > BUMP * h.top) ctx.emit('custom:bump', { x: p.x, y: p.y, speed: Math.round(impact) });
    }
  },
});

export const meta = {
  id: 'movement-vehicle',
  genres: ['freeform'],
  summary:
    'Drive a vehicle seen from above instead of walking: left and right steer, up is the throttle, down brakes and then backs up, dash boosts (with boost on). It turns harder the faster it goes and grip decides how wide it drifts through a turn: a bike corners on rails, a boat drifts. Walls stop it and cost speed. kind: bike, car, boat or galleon, which sets its handling and its look. Replaces movement-topdown.',
  params: {
    kind: { type: 'string', values: [...VEHICLE_KINDS], default: 'car', affects: 'levels' },
    boost: { type: 'boolean', default: false, affects: 'none' },
  },
  emits: ['dash', 'custom:bump'],
  feedbackFor: ['dash', 'custom:bump'],
  controls: { left: 'steer', right: 'steer', up: 'throttle', down: 'brake', dash: 'boost' },
  controlGates: { dash: 'boost' },
  provides: { movement: 'topdown' },
} as const;
