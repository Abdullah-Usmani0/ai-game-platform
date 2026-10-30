import { approach, defineSystem } from '@gg/sdk';
import { RUN_SPEED } from './auto-run.js';

export interface MovementState {
  coyote: number;
  jumpBuffer: number;
  varJump: number;
  prevJump: boolean;
  prevDash: boolean;
  dashTicks: number;
  dashCooldown: number;
  wasGrounded: boolean;
  /** Air jumps used since the player last stood on ground (gated movement only). */
  airJumps: number;
  /** A dash was used since the player last stood on ground (gated movement only: one dash per airtime). */
  airDashed: boolean;
}

const TICKS = 60;

/** Ability flags on the player that gated movement reads (the relics system of the metroidvania genre sets them). */
export const ABILITY_DASH = 'dash';
export const ABILITY_DOUBLE_JUMP = 'double-jump';

export interface MovementOptions {
  id: string;
  /**
   * Gated: the dash needs the player's 'dash' ability flag and is limited to one per airtime; 'double-jump' grants one
   * air jump. Ungated (the platformer): dash always available on its cooldown, no air jumps.
   */
  gated: boolean;
}

/** Precision platformer movement driven entirely by the feel preset (Celeste-class by default). */
export function createMovement(opts: MovementOptions) {
  return defineSystem<MovementState>({
    id: opts.id,
    init: () => ({
      coyote: 0,
      jumpBuffer: 0,
      varJump: 0,
      prevJump: false,
      prevDash: false,
      dashTicks: 0,
      dashCooldown: 0,
      wasGrounded: false,
      airJumps: 0,
      airDashed: false,
    }),
    fixedUpdate(s, input, ctx) {
      const p = ctx.world.player;
      const f = ctx.feel;
      const dt = ctx.dt;
      if (!p.alive) return;
      // A runner (the auto-run system) sets the speed the player keeps running at: left and right do nothing then.
      const run = typeof p.props[RUN_SPEED] === 'number' ? p.props[RUN_SPEED] : 0;
      const dir = run !== 0 ? Math.sign(run) : (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) p.facing = dir;
      const canDash = !opts.gated || (p.flags[ABILITY_DASH] === true && !s.airDashed);
      const maxAirJumps = opts.gated && p.flags[ABILITY_DOUBLE_JUMP] === true ? 1 : 0;

      // Dash: fixed-speed burst, gravity off, then cooldown.
      const dashPressed = input.dash && !s.prevDash;
      if (dashPressed && canDash && s.dashCooldown === 0 && s.dashTicks === 0) {
        if (opts.gated) {
          // Gated dashes travel flat: the dash ends any variable-jump rise (ungated keeps the platformer's behaviour).
          s.varJump = 0;
          if (!p.grounded) s.airDashed = true;
        }
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
        const target = run !== 0 ? run : dir * f.maxRun;
        if (Math.abs(p.vx) > Math.abs(target) && Math.sign(p.vx) === Math.sign(target) && target !== 0) {
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
      if (p.grounded) {
        s.coyote = Math.round(f.coyoteTime * TICKS);
        s.airJumps = 0;
        s.airDashed = false;
      } else if (s.coyote > 0) s.coyote--;
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
      } else if (jumpPressed && s.coyote === 0 && s.airJumps < maxAirJumps && s.dashTicks === 0) {
        // Air jump (double jump): a full jump from wherever the player is, once per airtime.
        p.vy = f.jumpSpeed;
        s.varJump = Math.round(f.varJumpTime * TICKS);
        s.airJumps++;
        s.jumpBuffer = 0;
        p.scaleX = f.squashJump[0];
        p.scaleY = f.squashJump[1];
        ctx.emit('jump', { x: p.x, y: p.y, air: true });
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
}

/** The platformer's movement: ungated (dash always on its cooldown, no air jumps). */
export const movement = createMovement({ id: 'movement-platformer', gated: false });

export const meta = {
  id: 'movement-platformer',
  genres: ['platformer'],
  required: true,
  summary:
    'Precision platformer movement driven by the feel preset: run accel/reduce, air control, variable jump, coyote time, jump buffer, dash, squash and stretch.',
  params: {},
  emits: ['jump', 'land', 'dash'],
  feedbackFor: ['jump', 'land', 'dash'],
  controls: { left: 'run', right: 'run', jump: 'jump', dash: 'dash' },
  provides: { movement: 'platformer' },
} as const;
