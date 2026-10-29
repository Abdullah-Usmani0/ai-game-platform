import { defineSystem, isHostile, type Entity } from '@gg/sdk';

function nearestEnemy(entities: Entity[], px: number, py: number, range: number): Entity | null {
  let best: Entity | null = null;
  let bestD = range;
  for (const e of entities) {
    if (!isHostile(e)) continue;
    const d = Math.hypot(e.x + e.w / 2 - px, e.y + e.h / 2 - py);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

interface AttackState {
  cooldown: number;
  kills: number;
  xp: number;
  level: number;
}

/**
 * The survivors staple: the player attacks the nearest enemy in range automatically; kills drop xp;
 * xp levels the player up, which shortens the cooldown and, every second level, raises damage.
 * This is the genre's core loop ("every kill feeds the next"): pressure can exceed base dps because power grows.
 */
export const autoAttack = defineSystem<AttackState>({
  id: 'auto-attack',
  init: () => ({ cooldown: 0, kills: 0, xp: 0, level: 0 }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    if (s.cooldown > 0) {
      s.cooldown--;
      return;
    }
    const range = Number(ctx.params['range'] ?? 40) + s.level * 2;
    const target = nearestEnemy(ctx.world.entities, p.x + p.w / 2, p.y + p.h / 2, range);
    if (!target) return;
    const damage = Number(ctx.params['damage'] ?? 1) + Math.floor(s.level / 2);
    ctx.damage(target, damage, p);
    const base = Number(ctx.params['cooldownTicks'] ?? 30);
    s.cooldown = Math.max(6, Math.round(base * Math.pow(0.85, s.level)));
    p.facing = target.x >= p.x ? 1 : -1;
  },
  onEvent(s, ev, ctx) {
    if (ev.name === 'pickup' && ev.payload['type'] === String(ctx.params['dropType'] ?? 'xp')) {
      s.xp++;
      const per = Number(ctx.params['xpPerLevel'] ?? 6);
      if (s.xp >= per * (s.level + 1)) {
        s.level++;
        ctx.world.hud['lvl'] = s.level;
        ctx.emit('custom:level_up', { level: s.level });
      }
      return;
    }
    if (ev.name !== 'death' || ev.payload['type'] === 'player') return;
    s.kills++;
    ctx.world.hud['kills'] = s.kills;
    const x = Number(ev.payload['x'] ?? 0);
    const y = Number(ev.payload['y'] ?? 0);
    ctx.spawn(String(ctx.params['dropType'] ?? 'xp'), x + 2, y + 2);
  },
});

export const meta = {
  id: 'auto-attack',
  genres: ['survivors'],
  required: true,
  summary: 'Automatic attack on the nearest enemy in range; kills drop xp; xp levels up attack speed, range and damage.',
  params: {
    range: { type: 'number', min: 16, max: 160, default: 40, affects: 'none' },
    damage: { type: 'number', min: 1, max: 20, default: 1, affects: 'none' },
    cooldownTicks: { type: 'number', min: 5, max: 120, default: 30, affects: 'none' },
    xpPerLevel: { type: 'number', min: 2, max: 50, default: 6, affects: 'levels' },
    dropType: { type: 'string', default: 'xp', affects: 'none', composed: 'entity' },
  },
  emits: ['hit', 'damage', 'death', 'spawn', 'custom:level_up'],
  feedbackFor: ['hit'],
  provides: { combat: 'aura', spawns: ['xp'] },
  requires: { roles: ['hostile'] },
} as const;
