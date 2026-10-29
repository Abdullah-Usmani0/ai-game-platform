import { z } from 'zod';
import { Id } from './common';

/** One condition a level can be won by. */
export const WinClause = z.discriminatedUnion('kind', [
  /** Stand on the goal tile. */
  z.object({ kind: z.literal('reach_goal') }),
  /** Stay alive this long (the clock runs only while the game does: menus and pause hold it). */
  z.object({ kind: z.literal('survive'), seconds: z.number().min(5).max(900) }),
  /** Defeat this many hostiles (of one type, or any), or all of them. */
  z.object({ kind: z.literal('defeat'), type: Id.optional(), count: z.union([z.int().min(1).max(500), z.literal('all')]) }),
  /** Pick up this many items (of one type, or any). */
  z.object({ kind: z.literal('collect'), type: Id.optional(), count: z.int().min(1).max(500) }),
  /** A number on the HUD reaches a value (score, gold, coins). */
  z.object({ kind: z.literal('hud_at_least'), key: z.string().min(1).max(24), value: z.number() }),
]);
export type WinClause = z.infer<typeof WinClause>;

/** One condition a level is lost by. */
export const LoseClause = z.discriminatedUnion('kind', [
  /** The level was not won in time. */
  z.object({ kind: z.literal('time_out'), seconds: z.number().min(5).max(900) }),
  /** The run ends on this many deaths (1: the first death ends it); before that the player respawns. */
  z.object({ kind: z.literal('lives'), count: z.int().min(1).max(9) }),
]);
export type LoseClause = z.infer<typeof LoseClause>;

/** content/objectives.json: how a level of a composed game is won and lost (the objectives system reads it). */
export const Objectives = z.object({
  version: z.literal(1),
  win: z.object({
    /** all: every clause holds at once; any: one is enough. */
    mode: z.enum(['all', 'any']).default('all'),
    clauses: z.array(WinClause).min(1).max(6),
  }),
  lose: z.array(LoseClause).max(3).default([]),
});
export type Objectives = z.infer<typeof Objectives>;
