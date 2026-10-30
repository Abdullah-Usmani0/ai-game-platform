import type { EntityDef } from '@gg/sdk';
import type { EntityRole } from '@gg/validators';

/**
 * A farm's things. None of them hurts or is picked up by touch: the player works them with the action key, standing on
 * the next tile and facing them. Soil plots and the crops on them are one tile; the shop stall is two by two. The
 * farmhouse, trees and bushes only dress the farm: they stand on wall tiles, which is what stops the player.
 */
export const ENTITY_DEFS: EntityDef[] = [
  { type: 'plot', w: 8, h: 8, gravity: false },
  { type: 'crop', w: 8, h: 8, gravity: false },
  { type: 'bin', w: 8, h: 8, gravity: false },
  { type: 'shop', w: 16, h: 16, gravity: false },
  { type: 'bed', w: 8, h: 8, gravity: false },
  { type: 'house', w: 48, h: 24, gravity: false },
  { type: 'tree', w: 16, h: 16, gravity: false },
  { type: 'bush', w: 8, h: 8, gravity: false },
];
/** The farm's scenery: drawn over the wall tiles it stands on, doing nothing. */
export const DECOR_TYPES: readonly string[] = ['house', 'tree', 'bush'];
/**
 * The farmer's feet: smaller than a tile, so walking between the beds and past a corner never needs pixel-perfect aim
 * (the sprite stands taller). One heart: nothing on a farm hurts, so the HUD shows none.
 */
export const PLAYER = { w: 6, h: 6, hp: 1 } as const;
export const COLLECTIBLE_TYPES: string[] = [];
export const ENTITY_ROLES: Record<string, EntityRole[]> = { plot: ['plot'], shop: ['shop'], bin: ['bin'], bed: ['bed'] };
