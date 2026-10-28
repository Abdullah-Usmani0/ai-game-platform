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

export const ScopeTier = z.enum(['small', 'medium', 'large']);
export type ScopeTier = z.infer<typeof ScopeTier>;
