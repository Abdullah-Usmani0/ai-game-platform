/** Movement feel preset. Values are pixels, pixels/second and seconds at the level's tile scale. */
export interface FeelPreset {
  id: string;
  maxRun: number;
  runAccel: number;
  runReduce: number;
  airMult: number;
  gravity: number;
  halfGravThreshold: number;
  maxFall: number;
  jumpSpeed: number;
  jumpHBoost: number;
  varJumpTime: number;
  coyoteTime: number;
  jumpBufferTime: number;
  dashSpeed: number;
  dashTime: number;
  dashCooldown: number;
  dashFreezeTime: number;
  cornerCorrection: number;
  squashJump: readonly [number, number];
  squashLand: readonly [number, number];
}

/** Celeste's published constants (Player.cs), at 8 px tiles / 320x180. */
export const CELESTE_CLASS: FeelPreset = {
  id: 'celeste-class',
  maxRun: 90,
  runAccel: 1000,
  runReduce: 400,
  airMult: 0.65,
  gravity: 900,
  halfGravThreshold: 40,
  maxFall: 160,
  jumpSpeed: -105,
  jumpHBoost: 40,
  varJumpTime: 0.2,
  coyoteTime: 0.1,
  jumpBufferTime: 0.1,
  dashSpeed: 240,
  dashTime: 0.15,
  dashCooldown: 0.2,
  dashFreezeTime: 0.05,
  cornerCorrection: 4,
  squashJump: [0.6, 1.4],
  squashLand: [1.6, 0.4],
};

export const FEEL_PRESETS: Record<string, FeelPreset> = { [CELESTE_CLASS.id]: CELESTE_CLASS };
