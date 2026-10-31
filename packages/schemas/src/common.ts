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
  'castle',
  'freeform',
] as const;
export const Genre = z.enum(GENRES);
export type Genre = z.infer<typeof Genre>;

/**
 * The genres a template game's design files name: every genre but freeform, whose design files have schemas of their own
 * (they also name the base genre). The curated schemas and the prompts built from them stay as they were.
 */
export const TemplateGenre = Genre.exclude(['freeform']);
export type TemplateGenre = z.infer<typeof TemplateGenre>;

/** The genres with a template of their own (systems, level generator, solver bot). */
export const CURATED_GENRES = ['platformer', 'survivors', 'topdown-action', 'metroidvania', 'shmup', 'puzzle', 'lifesim', 'castle'] as const satisfies readonly Genre[];
export const CuratedGenre = z.enum(CURATED_GENRES);
export type CuratedGenre = z.infer<typeof CuratedGenre>;

/**
 * The curated genres a freeform game builds on (its base: levels, solver, feel and art). The castle tier is not one
 * yet: it joins once the freeform vocabulary is per base, so freeform's schemas and prompts stay as they are.
 */
export const FREEFORM_BASES = ['platformer', 'survivors', 'topdown-action', 'metroidvania', 'shmup', 'puzzle', 'lifesim'] as const satisfies readonly CuratedGenre[];
export const FreeformBase = z.enum(FREEFORM_BASES);
export type FreeformBase = z.infer<typeof FreeformBase>;

/**
 * The genres a game can be created in today: each curated one has its template (systems, level generator, solver bot);
 * a freeform game composes its own from theirs, on the curated genre it builds on.
 */
export const PLAYABLE_GENRES = [...CURATED_GENRES, 'freeform'] as const satisfies readonly Genre[];
export const PlayableGenre = z.enum(PLAYABLE_GENRES);
export type PlayableGenre = z.infer<typeof PlayableGenre>;

export const ScopeTier = z.enum(['small', 'medium', 'large']);
export type ScopeTier = z.infer<typeof ScopeTier>;
