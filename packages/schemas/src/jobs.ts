import { z } from 'zod';
import { PlayableGenre, ScopeTier } from './common';
import { LevelJson } from './level';

/** What a user asks for on the create form; the input of a create job. */
export const CreateRequest = z.object({
  prompt: z.string().min(10).max(4000),
  /** Only genres with a template: anything else would pass here and fail at the first stage. */
  genre: PlayableGenre,
  scopeTier: ScopeTier.default('small'),
  title: z.string().min(1).max(80).optional(),
  referenceTitles: z.array(z.string().max(80)).max(4).default([]),
  seed: z.int().min(1).optional(),
  /** No model calls: agent stages are skipped and data stages take exemplar artifacts (CI, evals, demos). */
  dryRun: z.boolean().default(false),
});
export type CreateRequest = z.infer<typeof CreateRequest>;

export const EDIT_ROUTES = ['parameter', 'style', 'behaviour', 'content', 'code'] as const;
export const EditRouteName = z.enum(EDIT_ROUTES);
export type EditRouteName = z.infer<typeof EditRouteName>;

/** The edit router's structured output. Confidence under 0.7 falls back to the code route (the safe default). */
export const EditRoute = z.object({
  designNotes: z.string().max(400),
  route: EditRouteName,
  /** System ids, behaviour ids or level ids the edit touches. */
  targets: z.array(z.string().max(80)).max(12).default([]),
  affectedScenes: z.array(z.string().max(40)).max(8).default([]),
  confidence: z.number().min(0).max(1),
  /** parameter route only: values to set in systems.json, keyed "<systemId>.<param>". */
  paramPatch: z.array(z.object({ key: z.string().max(80), value: z.union([z.number(), z.string().max(64), z.boolean()]) })).max(12).default([]),
});
export type EditRoute = z.infer<typeof EditRoute>;

/**
 * Content authored directly (the level editor): each level replaces the file with the same id after the genre
 * validator and the solver bot accept it. No model call is involved.
 */
export const ContentPatch = z.object({
  levels: z.array(LevelJson).min(1).max(10),
});
export type ContentPatch = z.infer<typeof ContentPatch>;

/** The input of an edit job: the user's message (the worker routes it), or authored content (applied as given). */
export const EditRequest = z.object({
  message: z.string().min(2).max(2000),
  baseVersionId: z.string().optional(),
  dryRun: z.boolean().default(false),
  content: ContentPatch.optional(),
});
export type EditRequest = z.infer<typeof EditRequest>;
