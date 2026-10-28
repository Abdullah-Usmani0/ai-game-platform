import { z } from 'zod';
import { Id, Vec2 } from './common.js';

export const TILE_KINDS = ['air', 'solid', 'hazard', 'oneway', 'goal', 'spawn'] as const;
export const TileKind = z.enum(TILE_KINDS);
export type TileKind = z.infer<typeof TileKind>;

export const LevelEntity = z.object({
  type: Id,
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  props: z.record(z.string(), z.union([z.number(), z.string().max(64), z.boolean()])).default({}),
});
export type LevelEntity = z.infer<typeof LevelEntity>;

/** Tilemap level: rows of legend characters plus an entity layer. Flat and non-recursive. */
export const LevelJson = z
  .object({
    version: z.literal(1),
    id: Id,
    name: z.string().max(80),
    tileSize: z.int().min(8).max(64),
    width: z.int().min(8).max(400),
    height: z.int().min(6).max(200),
    legend: z.record(z.string().length(1), TileKind),
    rows: z.array(z.string()).min(6).max(200),
    entities: z.array(LevelEntity).max(500).default([]),
    spawn: Vec2,
    goal: Vec2,
    ramp: z.object({ segment: z.int().min(0), difficulty: z.number().min(0).max(1) }).optional(),
  })
  .superRefine((lvl, ctx) => {
    if (lvl.rows.length !== lvl.height) {
      ctx.addIssue({ code: 'custom', message: `rows.length ${lvl.rows.length} != height ${lvl.height}`, path: ['rows'] });
    }
    lvl.rows.forEach((row, i) => {
      if (row.length !== lvl.width) {
        ctx.addIssue({ code: 'custom', message: `row ${i} length ${row.length} != width ${lvl.width}`, path: ['rows', i] });
      }
      for (const ch of row) {
        if (!(ch in lvl.legend)) {
          ctx.addIssue({ code: 'custom', message: `row ${i}: '${ch}' missing from legend`, path: ['rows', i] });
          break;
        }
      }
    });
  });
export type LevelJson = z.infer<typeof LevelJson>;
