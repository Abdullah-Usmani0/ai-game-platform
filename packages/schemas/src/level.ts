import { z } from 'zod';
import { Id, Vec2 } from './common';

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

export const ROOM_KINDS = ['room', 'save', 'warp', 'boss', 'npc', 'secret', 'exit'] as const;

/**
 * A room of a region: a rectangle of tiles the camera holds to while the player is in it, and what it is for (a save
 * altar's room, a boss's arena, a secret). Rooms tile a region without overlapping.
 */
export const LevelRoom = z.object({
  id: Id,
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  w: z.int().min(4).max(400),
  h: z.int().min(4).max(200),
  kind: z.enum(ROOM_KINDS).default('room'),
  /** The backdrop and palette shift it is drawn with, and the music it plays (the art direction's names). */
  theme: z.string().max(32).optional(),
  music: z.string().max(32).optional(),
});
export type LevelRoom = z.infer<typeof LevelRoom>;

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
    /** A region's rooms (the castle tier); a level without them is one space. */
    rooms: z.array(LevelRoom).max(256).optional(),
  })
  .superRefine((lvl, ctx) => {
    const rooms = lvl.rooms ?? [];
    const ids = new Set<string>();
    rooms.forEach((r, i) => {
      if (ids.has(r.id)) ctx.addIssue({ code: 'custom', message: `room id '${r.id}' is used twice`, path: ['rooms', i, 'id'] });
      ids.add(r.id);
      if (r.x + r.w > lvl.width || r.y + r.h > lvl.height) ctx.addIssue({ code: 'custom', message: `room '${r.id}' reaches past the level`, path: ['rooms', i] });
      for (let j = 0; j < i; j++) {
        const o = rooms[j]!;
        if (r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h) ctx.addIssue({ code: 'custom', message: `rooms '${o.id}' and '${r.id}' overlap`, path: ['rooms', i] });
      }
    });
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
