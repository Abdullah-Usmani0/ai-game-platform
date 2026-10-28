import { defineSystem } from '@gg/sdk';

interface SwitchState {
  openUntil: number;
}

/** Example: standing on a tile flagged `switch` opens a door (flag on the world) for `openTicks`. */
export const timedSwitch = defineSystem<SwitchState>({
  id: 'timed-switch',
  init: () => ({ openUntil: -1 }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    const openTicks = Number(ctx.params['openTicks'] ?? 180);
    const onSwitch = ctx.world.entities.some((e) => e.type === 'switch' && e.alive && Math.abs(e.x - p.x) < 8 && Math.abs(e.y - p.y) < 12);
    if (onSwitch && s.openUntil < ctx.tick) {
      s.openUntil = ctx.tick + openTicks;
      ctx.emit('custom:door_open', { until: s.openUntil });
    }
    ctx.world.hud['door'] = s.openUntil >= ctx.tick ? 'open' : 'closed';
  },
});
