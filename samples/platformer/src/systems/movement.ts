import { approach, defineSystem } from '@gg/sdk';

interface MovementState {
  coyote: number;
  jumpBuffer: number;
  varJump: number;
  prevJump: boolean;
  prevDash: boolean;
  dashTicks: number;
  dashCooldown: number;
  wasGrounded: boolean;
}

const TICKS = 60;

/** Precision platformer movement driven entirely by the feel preset (Celeste-class by default). */
export const movement = defineSystem<MovementState>({
  id: 'movement-platformer',
  init: () => ({ coyote: 0, jumpBuffer: 0, varJump: 0, prevJump: false, prevDash: false, dashTicks: 0, dashCooldown: 0, wasGrounded: false }),
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    const f = ctx.feel;
    const dt = ctx.dt;
    if (!p.alive) return;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) p.facing = dir;

    // Dash: fixed-speed burst, gravity off, then cooldown.
    const dashPressed = input.dash && !s.prevDash;
    if (dashPressed && s.dashCooldown === 0 && s.dashTicks === 0) {
      s.dashTicks = Math.round(f.dashTime * TICKS);
      s.dashCooldown = Math.round((f.dashTime + f.dashCooldown) * TICKS);
      p.vx = p.facing * f.dashSpeed;
      p.vy = 0;
      ctx.emit('dash', { facing: p.facing });
    }
    if (s.dashCooldown > 0) s.dashCooldown--;

    if (s.dashTicks > 0) {
      s.dashTicks--;
      p.vy = 0;
    } else {
      // Horizontal: accelerate toward target, reduce when over max.
      const mult = p.grounded ? 1 : f.airMult;
      const target = dir * f.maxRun;
      if (Math.abs(p.vx) > f.maxRun && Math.sign(p.vx) === Math.sign(target) && target !== 0) {
        p.vx = approach(p.vx, target, f.runReduce * mult * dt);
      } else {
        p.vx = approach(p.vx, target, f.runAccel * mult * dt);
      }
      // Gravity with half-gravity apex when the jump is held.
      if (!p.grounded) {
        const nearApex = Math.abs(p.vy) < f.halfGravThreshold && input.jump;
        p.vy = approach(p.vy, f.maxFall, (nearApex ? f.gravity * 0.5 : f.gravity) * dt);
      }
    }

    // Coyote time and jump buffering.
    if (p.grounded) s.coyote = Math.round(f.coyoteTime * TICKS);
    else if (s.coyote > 0) s.coyote--;
    const jumpPressed = input.jump && !s.prevJump;
    if (jumpPressed) s.jumpBuffer = Math.round(f.jumpBufferTime * TICKS);
    else if (s.jumpBuffer > 0) s.jumpBuffer--;

    if (s.jumpBuffer > 0 && s.coyote > 0 && s.dashTicks === 0) {
      p.vy = f.jumpSpeed;
      p.vx += dir * f.jumpHBoost;
      s.varJump = Math.round(f.varJumpTime * TICKS);
      s.coyote = 0;
      s.jumpBuffer = 0;
      p.scaleX = f.squashJump[0];
      p.scaleY = f.squashJump[1];
      ctx.emit('jump', { x: p.x, y: p.y });
    }
    // Variable jump height: hold to keep rising for up to varJumpTime.
    if (s.varJump > 0) {
      if (input.jump) {
        p.vy = Math.min(p.vy, f.jumpSpeed);
        s.varJump--;
      } else {
        s.varJump = 0;
      }
    }

    s.wasGrounded = p.grounded;
    ctx.move(p, p.vx * dt, p.vy * dt);
    if (p.hitCeiling) s.varJump = 0;
    if (p.grounded && !s.wasGrounded) {
      p.scaleX = f.squashLand[0];
      p.scaleY = f.squashLand[1];
      ctx.emit('land', { x: p.x, y: p.y });
    }
    // Squash/stretch recovers at 1.75 per second (Celeste).
    p.scaleX = approach(p.scaleX, 1, 1.75 * dt);
    p.scaleY = approach(p.scaleY, 1, 1.75 * dt);

    s.prevJump = input.jump;
    s.prevDash = input.dash;
  },
});
