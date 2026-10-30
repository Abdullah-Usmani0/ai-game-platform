import { z } from 'zod';
import { Id } from './common';

/**
 * The colour ramps of the art kit a sprite can take its own colour for, each five shades made from the one given, and
 * the slot letters that paint with them: hero 1 2 3 4 5 (skin, the body), garment g G h H (clothes), accent a A b B and
 * c C z Z (hair, trims, what a crop bears), danger x d D e E (what hurts), secondary m M n N (a second hue), rim o v V
 * y Y (leaves, moss), wood p q Q r R (a hat, planks, a handle). The others are fixed: k ink, w white, stone t T u U,
 * ui i I, dark wood O s.
 */
export const SPRITE_RAMPS = ['hero', 'garment', 'accent', 'danger', 'secondary', 'rim', 'wood'] as const;
export type SpriteRamp = (typeof SPRITE_RAMPS)[number];
export const SPRITE_SLOTS = 'kw12345gGhHaAbBcCzZxdDeEmMnNovVyYpqQrRtTuUiIOs';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb colour');
const Row = z.string().regex(new RegExp(`^[._${SPRITE_SLOTS}]{1,16}$`), `slot letters (${SPRITE_SLOTS}), '.' to leave the base as it is, '_' to clear it`);

/**
 * Pixels painted onto every frame of some of the base's animations: horns, wings, a lantern, a tail, stripes. A '.'
 * leaves the base's pixel, '_' clears it (a hat taken off); it moves with the body when a frame of the walk bobs.
 */
export const SpriteOverlay = z.object({
  /** The animations it goes on ('*': all of them; a directional sprite's are down-idle, side-run, up-attack, ...). */
  anims: z.union([z.literal('*'), z.array(z.string().regex(/^[a-z][a-z0-9-]{0,23}$/)).min(1).max(24)]).default('*'),
  /** Its top-left pixel in the frame (the base's template, before the outline). */
  x: z.int().min(0).max(31),
  y: z.int().min(0).max(31),
  rows: z.array(Row).min(1).max(16),
  /** Painted under the base's own pixels (wings behind a body) rather than over them. */
  under: z.boolean().default(false),
});
export type SpriteOverlay = z.infer<typeof SpriteOverlay>;

/**
 * How one entity type looks: a shipped sprite to start from (the one its role draws with, or another of the same build),
 * its own colours for some ramps, and a few overlays. The animations, frame size and anchor stay the base's.
 */
export const SpriteDesign = z.object({
  /** The entity type it draws, or @player for the player. */
  type: z.union([Id, z.literal('@player')]),
  base: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'a shipped sprite'),
  recolor: z.partialRecord(z.enum(SPRITE_RAMPS), Hex).optional(),
  overlays: z.array(SpriteOverlay).max(8).default([]),
});
export type SpriteDesign = z.infer<typeof SpriteDesign>;

/** content/sprites.json: how the game's entities and its player look, one design per type at most. */
export const SpriteSheet = z
  .object({
    version: z.literal(1),
    sprites: z.array(SpriteDesign).max(24),
  })
  .refine((s) => new Set(s.sprites.map((d) => d.type)).size === s.sprites.length, { message: 'one design per type', path: ['sprites'] });
export type SpriteSheet = z.infer<typeof SpriteSheet>;
