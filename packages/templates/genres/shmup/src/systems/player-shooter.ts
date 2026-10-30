import { centerX, centerY, defineSystem, isHostile, overlaps, type Entity, type InputState, type SimCtx } from '@gg/sdk';

interface ShooterState {
  cooldown: number;
  fired: number;
  kills: number;
  /** The way the arrows last pointed: top-down shots aimed where the player faces. */
  dirX: number;
  dirY: number;
}

/** How far apart an aimed spread's shots fly, in radians: the upward spread's fan (40 px/s sideways at 220 up). */
const FAN = 0.18;

/**
 * Hold the action key to fire shots on a cooldown; shots damage the first hostile they overlap and vanish. They fly
 * straight up (a vertical shooter), the way the player faces (top-down: where the arrows last pointed; side view:
 * forward, or up while up is held, down while down is held in the air, slanted with forward held too), or at the
 * nearest hostile in range (else forward). Spread fans extra shots. Kills score; power pickups are collected by the
 * shared pickups system.
 */
export const playerShooter = defineSystem<ShooterState>({
  id: 'player-shooter',
  init: () => ({ cooldown: 0, fired: 0, kills: 0, dirX: 0, dirY: -1 }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    ctx.world.hud['kills'] = s.kills;
    if (!p.alive) return;
    const aim = String(ctx.params['aim'] ?? 'up');
    if (aim === 'facing' && ctx.movementMode === 'topdown') {
      const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        s.dirX = dx / len;
        s.dirY = dy / len;
      }
    }
    if (s.cooldown > 0) s.cooldown--;
    const damage = Number(ctx.params['damage'] ?? 1);
    const shotType = String(ctx.params['shotType'] ?? 'shot');
    if (input.action && s.cooldown === 0) {
      s.cooldown = Math.max(1, Math.round(Number(ctx.params['fireCooldownTicks'] ?? 8)));
      const speed = Number(ctx.params['shotSpeed'] ?? 220);
      const spread = Math.max(1, Math.min(3, Math.round(Number(ctx.params['spread'] ?? 1))));
      if (aim === 'up') {
        for (let i = 0; i < spread; i++) {
          const shot = ctx.spawn(shotType, centerX(p) - 1.5, p.y - 6);
          const lateral = spread === 1 ? 0 : (i - (spread - 1) / 2) * 40;
          shot.vx = lateral;
          shot.vy = -speed;
          shot.facing = 1;
          s.fired++;
        }
        ctx.emit('custom:fire', { x: p.x, y: p.y });
      } else {
        const [ax, ay] = aimOf(aim, s, input, ctx);
        const def = ctx.defOf(shotType);
        const heading = Math.atan2(ay, ax);
        for (let i = 0; i < spread; i++) {
          const a = heading + (spread === 1 ? 0 : (i - (spread - 1) / 2) * FAN);
          // From the player's middle, a few pixels out along the shot's flight.
          const shot = ctx.spawn(shotType, centerX(p) + Math.cos(a) * 4 - (def?.w ?? 0) / 2, centerY(p) + Math.sin(a) * 4 - (def?.h ?? 0) / 2);
          shot.vx = Math.cos(a) * speed;
          shot.vy = Math.sin(a) * speed;
          shot.facing = shot.vx < 0 ? -1 : 1;
          s.fired++;
        }
        ctx.emit('custom:fire', { x: p.x, y: p.y, dirX: ax, dirY: ay });
      }
    }
    for (const shot of ctx.world.entities) {
      if (shot.type !== shotType || !shot.alive) continue;
      for (const e of ctx.world.entities) {
        if (!isHostile(e) || !overlaps(shot, e)) continue;
        shot.alive = false;
        ctx.emit('despawn', { entity: shot.id, type: shotType });
        ctx.damage(e, damage, p);
        if (!e.alive) {
          s.kills++;
          ctx.world.score += Number(ctx.params['killScore'] ?? 10);
        }
        break;
      }
    }
  },
});

/** The way an aimed volley flies, as a unit vector: at the nearest hostile in range, else where the player faces. */
function aimOf(aim: string, s: ShooterState, input: InputState, ctx: SimCtx): [number, number] {
  const p = ctx.world.player;
  const forward = p.facing < 0 ? -1 : 1;
  if (aim === 'nearest') {
    let best: Entity | null = null;
    let reach = Number(ctx.params['range'] ?? 160);
    for (const e of ctx.world.entities) {
      if (!isHostile(e)) continue;
      const d = Math.hypot(centerX(e) - centerX(p), centerY(e) - centerY(p));
      if (d > 0 && d <= reach) {
        best = e;
        reach = d;
      }
    }
    return best ? [(centerX(best) - centerX(p)) / reach, (centerY(best) - centerY(p)) / reach] : [forward, 0];
  }
  if (ctx.movementMode === 'topdown') return [s.dirX, s.dirY];
  const up = input.up ? -1 : input.down && !p.grounded ? 1 : 0;
  const ahead = up === 0 || input.left || input.right ? forward : 0;
  const len = Math.hypot(ahead, up);
  return [ahead / len, up / len];
}

/** The arrows aim only while the shots fly the way the player faces. */
const AIM_KEYS = { param: 'aim', values: ['facing'] } as const;

export const meta = {
  id: 'player-shooter',
  genres: ['shmup'],
  required: true,
  summary:
    "Hold the action key to fire shots that damage hostiles; spread fans extra shots; kills score. aim: 'up' fires straight up (a vertical shooter), 'facing' the way the player faces (top-down: where the arrows last pointed; side view: forward, up with up held), 'nearest' at the closest hostile within range (twin-stick arenas; one key to fire). A side view aims 'facing' or 'nearest'.",
  params: {
    fireCooldownTicks: { type: 'number', min: 4, max: 30, default: 8, affects: 'levels' },
    shotSpeed: { type: 'number', min: 80, max: 400, default: 220, affects: 'none' },
    damage: { type: 'number', min: 1, max: 5, default: 1, affects: 'levels' },
    spread: { type: 'number', min: 1, max: 3, default: 1, affects: 'levels' },
    killScore: { type: 'number', min: 0, max: 100, default: 10, affects: 'none' },
    // Shots fired straight up hit nothing that walks a side-view floor.
    aim: { type: 'string', values: ['up', 'facing', 'nearest'], default: 'up', affects: 'levels', valuesWith: { platformer: ['facing', 'nearest'] } },
    range: { type: 'number', min: 48, max: 320, default: 160, affects: 'levels' },
    shotType: { type: 'string', default: 'shot', affects: 'none', composed: 'entity' },
  },
  emits: ['hit', 'damage', 'death', 'despawn', 'spawn', 'custom:fire'],
  feedbackFor: ['hit', 'death'],
  controls: { action: 'shoot', left: 'aim', right: 'aim', up: 'aim', down: 'aim' },
  controlGates: { left: AIM_KEYS, right: AIM_KEYS, up: AIM_KEYS, down: AIM_KEYS },
  provides: { combat: 'shoot', spawns: ['shot'] },
  requires: { movement: ['topdown', 'platformer'], roles: ['hostile'] },
} as const;
