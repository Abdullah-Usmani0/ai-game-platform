import { z } from 'zod';
import { Id } from './common';

export const WaveTable = z.object({
  version: z.literal(1),
  designNotes: z.string().max(400).default(''),
  waves: z
    .array(
      z.object({
        atS: z.number().min(0).max(3600),
        spawns: z
          .array(
            z.object({
              enemy: Id,
              count: z.int().min(1).max(200),
              pattern: z.enum(['ring', 'edge', 'random', 'line']),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(200),
});
export type WaveTable = z.infer<typeof WaveTable>;
