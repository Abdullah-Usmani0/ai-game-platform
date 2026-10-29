import { z } from 'zod';
import { CuratedGenre, Id, TemplateGenre } from './common';

export const ParamValue = z.union([z.number(), z.string().max(64), z.boolean()]);
export type ParamValue = z.infer<typeof ParamValue>;

export const SystemEntry = z.object({
  id: Id,
  params: z.record(z.string(), ParamValue).default({}),
});
export type SystemEntry = z.infer<typeof SystemEntry>;

/** systems.json: which catalog systems are on and how they are parameterised. */
export const SystemsJson = z.object({
  version: z.literal(1),
  genre: TemplateGenre,
  feelPreset: Id,
  systems: z.array(SystemEntry).min(1).max(40),
});
export type SystemsJson = z.infer<typeof SystemsJson>;

/** What a freeform game is made of besides its systems: the curated genre it builds on (levels, solver, feel, art setting). */
export const Composition = z.object({ base: CuratedGenre });
export type Composition = z.infer<typeof Composition>;

/** A freeform game's systems.json: systems from any genre's catalog, on a base genre. */
export const FreeformSystemsJson = SystemsJson.extend({ genre: z.literal('freeform'), composition: Composition });
export type FreeformSystemsJson = z.infer<typeof FreeformSystemsJson>;

/** Any game's design/systems.json. */
export const SystemsFile = z.union([FreeformSystemsJson, SystemsJson]);
export type SystemsFile = z.infer<typeof SystemsFile>;
