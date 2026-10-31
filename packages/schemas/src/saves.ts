import { z } from 'zod';
import { TileKind } from './level';

/** A player prop as a save keeps it: a number, a flag, or text up to 4 KB (the map of a region's rooms is one). */
const SavedProp = z.union([z.number(), z.string().max(4096), z.boolean()]);

/**
 * Where a player left a level (a rest at an altar), as the sim picks a level up from it: where they stood and which way
 * they faced, their props, the level's entities gone for good by their place in its list, and the tiles changed for good.
 */
export const SavedProgress = z.object({
  at: z.object({ x: z.number(), y: z.number() }),
  facing: z.union([z.literal(-1), z.literal(1)]).optional(),
  props: z.record(z.string(), SavedProp),
  removed: z.array(z.int().nonnegative()).max(4096),
  tiles: z.array(z.tuple([z.int().nonnegative(), z.int().nonnegative(), TileKind])).max(16384),
});
export type SavedProgress = z.infer<typeof SavedProgress>;

/**
 * What a game leaves with its host when the player rests (the bridge's save message), and is given back to pick up from
 * (the init's save): the level it was on, by its place in the game and its id, the save in it, and the props the level
 * began with (carried from the levels before it), so starting the level over keeps them.
 */
export const SaveBlob = z.object({
  v: z.literal(1),
  level: z.int().nonnegative(),
  levelId: z.string().min(1).max(64),
  save: SavedProgress,
  carry: z.record(z.string(), SavedProp).default({}),
});
export type SaveBlob = z.infer<typeof SaveBlob>;
