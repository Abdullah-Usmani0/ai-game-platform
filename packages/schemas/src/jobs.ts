import { z } from 'zod';
import { Genre, ScopeTier } from './common';

/** What a user asks for on the create form; the input of a create job. */
export const CreateRequest = z.object({
  prompt: z.string().min(10).max(4000),
  genre: Genre,
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

/** The input of an edit job: the user's message; the worker routes it. */
export const EditRequest = z.object({
  message: z.string().min(2).max(2000),
  baseVersionId: z.string().optional(),
  dryRun: z.boolean().default(false),
});
export type EditRequest = z.infer<typeof EditRequest>;
