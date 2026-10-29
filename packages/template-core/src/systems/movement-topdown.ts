import { approach, defineSystem } from '@gg/sdk';

/** Shared by every top-down genre (survivors, topdown-action, lifesim, roguelike); the catalog lists it once. */

/**
 * Eight-direction movement with acceleration from the feel preset; a short dash burst on the dash key. While the dash
 * lasts the player carries flags.dashing (melee reads it for dash-strikes) and, with dashInvuln, cannot be hurt.
 * A dashCdMul prop on the player (a boon) scales the dash cooldown.
 */
export const movementTopdown = defineSystem<{ prevDash: boolean; dashTicks: number; dashCooldown: number }>({
  id: 'movement-topdown',
  init: () => ({ prevDash: false, dashTicks: 0, dashCooldown: 0 }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    const f = ctx.feel;
    const dt = ctx.dt;
    if (!p.alive) return;
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    if (dx !== 0) p.facing = dx;
    const dashPressed = input.dash && !s.prevDash;
    if (dashPressed && ctx.params['dash'] !== false && s.dashCooldown === 0 && s.dashTicks === 0 && (dx !== 0 || dy !== 0)) {
      const cdMul = typeof p.props['dashCdMul'] === 'number' ? p.props['dashCdMul'] : 1;
      s.dashTicks = Math.round(f.dashTime * 60);
      s.dashCooldown = Math.round((f.dashTime + f.dashCooldown * cdMul) * 60);
      p.vx = (dx / len) * f.dashSpeed;
      p.vy = (dy / len) * f.dashSpeed;
      if (ctx.params['dashInvuln'] === true) p.invulnTicks = Math.max(p.invulnTicks, s.dashTicks + 2);
      ctx.emit('dash', { x: p.x, y: p.y });
    }
    if (s.dashCooldown > 0) s.dashCooldown--;
    if (s.dashTicks > 0) s.dashTicks--;
    else {
      p.vx = approach(p.vx, (dx / len) * f.maxRun, (dx === 0 ? f.runReduce : f.runAccel) * dt);
      p.vy = approach(p.vy, (dy / len) * f.maxRun, (dy === 0 ? f.runReduce : f.runAccel) * dt);
    }
    p.flags['dashing'] = s.dashTicks > 0;
    ctx.move(p, p.vx * dt, p.vy * dt);
    s.prevDash = input.dash;
  },
});

export const meta = {
  id: 'movement-topdown',
  genres: ['survivors', 'topdown-action', 'shmup', 'lifesim', 'roguelike'],
  required: true,
  summary: 'Eight-direction movement with acceleration and a dash burst, driven by the feel preset; the dash can grant invulnerability frames.',
  params: {
    dash: { type: 'boolean', default: true, affects: 'levels' },
    dashInvuln: { type: 'boolean', default: false, affects: 'levels' },
  },
  emits: ['dash'],
  feedbackFor: ['dash'],
} as const;
