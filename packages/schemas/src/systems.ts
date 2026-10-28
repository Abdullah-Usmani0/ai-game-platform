import { z } from 'zod';
import { Genre, Id } from './common.js';

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
  genre: Genre,
  feelPreset: Id,
  systems: z.array(SystemEntry).min(1).max(40),
});
export type SystemsJson = z.infer<typeof SystemsJson>;
