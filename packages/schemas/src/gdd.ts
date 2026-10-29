import { z } from 'zod';
import { CuratedGenre, ScopeTier, TemplateGenre } from './common';
import { FeedbackChannel, GameEventName } from './events';

export const GddFrontmatter = z.object({
  title: z.string().min(1).max(80),
  genre: TemplateGenre,
  scopeTier: ScopeTier,
  pillars: z.array(z.string().min(3).max(120)).length(3),
  scope: z.object({
    levels: z.int().min(1).max(40),
    enemies: z.int().min(0).max(40),
    items: z.int().min(0).max(60),
    bosses: z.int().min(0).max(8),
  }),
  targets: z.object({
    sessionMin: z.number().min(1).max(120),
    levelTimeS: z.number().min(10).max(900),
    deathsPerLevel: z.number().min(0).max(30),
  }),
  verbs: z.array(z.string().max(24)).min(1).max(12),
  feedbackEvents: z
    .array(z.object({ event: GameEventName, channels: z.array(FeedbackChannel).min(1) }))
    .min(1),
});
export type GddFrontmatter = z.infer<typeof GddFrontmatter>;

/**
 * A freeform game's front matter: the curated genre it builds on (its levels, solver, feel and art setting), the rest as
 * any game's. Its budgets, verbs and enemies are the base genre's to start from.
 */
export const FreeformGddFrontmatter = GddFrontmatter.extend({ genre: z.literal('freeform'), base: CuratedGenre });
export type FreeformGddFrontmatter = z.infer<typeof FreeformGddFrontmatter>;

/** Any game's front matter: a freeform game's names its base genre. */
export const AnyGddFrontmatter = z.union([FreeformGddFrontmatter, GddFrontmatter]);
export type AnyGddFrontmatter = z.infer<typeof AnyGddFrontmatter>;
