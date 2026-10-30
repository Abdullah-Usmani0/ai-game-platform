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

/**
 * A preset for a larger grid: every distance and speed times k, times left alone, so a jump clears as many tiles and a
 * run crosses as many tiles a second on 16 px tiles (k = 2) as the preset does on 8 px ones.
 */
export function scaleFeel(p: FeelPreset, k: number, id: string): FeelPreset {
  return {
    ...p,
    id,
    maxRun: p.maxRun * k,
    runAccel: p.runAccel * k,
    runReduce: p.runReduce * k,
    gravity: p.gravity * k,
    halfGravThreshold: p.halfGravThreshold * k,
    maxFall: p.maxFall * k,
    jumpSpeed: p.jumpSpeed * k,
    jumpHBoost: p.jumpHBoost * k,
    dashSpeed: p.dashSpeed * k,
    cornerCorrection: p.cornerCorrection * k,
  };
}

/**
 * The castle tier's feel, on 16 px tiles under a hero about 2.6 tiles tall. Agile: about 6.5 tiles a second and a jump
 * of about 3 tiles, a short dodge. Weighty: slower and lower, a heavier fall, committal.
 */
const AGILE_8: FeelPreset = { ...CELESTE_CLASS, maxRun: 52, runAccel: 700, runReduce: 500, airMult: 0.75, jumpSpeed: -105, jumpHBoost: 20, varJumpTime: 0.2, dashSpeed: 160, dashTime: 0.18, dashCooldown: 0.35, dashFreezeTime: 0, squashJump: [0.85, 1.15], squashLand: [1.2, 0.8] };
const WEIGHTY_8: FeelPreset = { ...AGILE_8, maxRun: 42, runAccel: 520, runReduce: 600, airMult: 0.6, gravity: 1000, maxFall: 190, jumpSpeed: -96, varJumpTime: 0.14, dashSpeed: 140, dashTime: 0.2, dashCooldown: 0.45 };
export const CASTLE_AGILE: FeelPreset = scaleFeel(AGILE_8, 2, 'castle-agile');
export const CASTLE_WEIGHTY: FeelPreset = scaleFeel(WEIGHTY_8, 2, 'castle-weighty');

export const FEEL_PRESETS: Record<string, FeelPreset> = { [CELESTE_CLASS.id]: CELESTE_CLASS, [CASTLE_AGILE.id]: CASTLE_AGILE, [CASTLE_WEIGHTY.id]: CASTLE_WEIGHTY };
