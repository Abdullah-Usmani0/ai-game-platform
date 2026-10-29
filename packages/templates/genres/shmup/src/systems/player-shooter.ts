import { centerX, defineSystem, isHostile, overlaps } from '@gg/sdk';

interface ShooterState {
  cooldown: number;
  fired: number;
  kills: number;
}

/**
 * Hold the action key to fire upward shots on a cooldown; shots damage the first hostile they overlap and vanish.
 * Spread fans extra shots sideways. Kills score; power pickups are collected by the shared pickups system.
 */
export const playerShooter = defineSystem<ShooterState>({
  id: 'player-shooter',
  init: () => ({ cooldown: 0, fired: 0, kills: 0 }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    ctx.world.hud['kills'] = s.kills;
    if (!p.alive) return;
    if (s.cooldown > 0) s.cooldown--;
    const damage = Number(ctx.params['damage'] ?? 1);
    const shotType = String(ctx.params['shotType'] ?? 'shot');
    if (input.action && s.cooldown === 0) {
      s.cooldown = Math.max(1, Math.round(Number(ctx.params['fireCooldownTicks'] ?? 8)));
      const speed = Number(ctx.params['shotSpeed'] ?? 220);
      const spread = Math.max(1, Math.min(3, Math.round(Number(ctx.params['spread'] ?? 1))));
      for (let i = 0; i < spread; i++) {
        const shot = ctx.spawn(shotType, centerX(p) - 1.5, p.y - 6);
        const lateral = spread === 1 ? 0 : (i - (spread - 1) / 2) * 40;
        shot.vx = lateral;
        shot.vy = -speed;
        shot.facing = 1;
        s.fired++;
      }
      ctx.emit('custom:fire', { x: p.x, y: p.y });
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

export const meta = {
  id: 'player-shooter',
  genres: ['shmup'],
  required: true,
  summary: 'Hold the action key to fire upward shots that damage hostiles; spread fans extra shots; kills score.',
  params: {
    fireCooldownTicks: { type: 'number', min: 4, max: 30, default: 8, affects: 'levels' },
    shotSpeed: { type: 'number', min: 80, max: 400, default: 220, affects: 'none' },
    damage: { type: 'number', min: 1, max: 5, default: 1, affects: 'levels' },
    spread: { type: 'number', min: 1, max: 3, default: 1, affects: 'levels' },
    killScore: { type: 'number', min: 0, max: 100, default: 10, affects: 'none' },
    shotType: { type: 'string', default: 'shot', affects: 'none', entity: true },
  },
  emits: ['hit', 'damage', 'death', 'despawn', 'spawn', 'custom:fire'],
  feedbackFor: ['hit', 'death'],
  controls: { action: 'shoot' },
  provides: { combat: 'shoot', spawns: ['shot'] },
  requires: { movement: ['topdown'], roles: ['hostile'] },
} as const;
