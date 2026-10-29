import { z } from 'zod';

export const Id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/, 'lowercase id');
export const Vec2 = z.object({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof Vec2>;

export const GENRES = [
  'platformer',
  'survivors',
  'topdown-action',
  'metroidvania',
  'shmup',
  'puzzle',
  'deckbuilder',
  'lifesim',
  'roguelike',
] as const;
export const Genre = z.enum(GENRES);
export type Genre = z.infer<typeof Genre>;

/** The genres a game can be created in today: each has a template (systems, level generator, solver bot). */
export const PLAYABLE_GENRES = ['platformer', 'survivors', 'topdown-action', 'metroidvania', 'shmup', 'puzzle'] as const satisfies readonly Genre[];
export const PlayableGenre = z.enum(PLAYABLE_GENRES);
export type PlayableGenre = z.infer<typeof PlayableGenre>;

export const ScopeTier = z.enum(['small', 'medium', 'large']);
export type ScopeTier = z.infer<typeof ScopeTier>;
