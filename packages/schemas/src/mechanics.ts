import { z } from 'zod';
import { Id } from './common';
import { GAME_EVENTS } from './events';

/** An event a bespoke system emits: one from the fixed table, or the game's own as custom:<name>. */
export const MechanicEvent = z.union([z.enum(GAME_EVENTS), z.string().regex(/^custom:[a-z][a-z0-9_-]{0,31}$/, 'custom:<name>')]);

export const INPUT_KEYS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'action', 'pause'] as const;
const MOVEMENT = z.enum(['platformer', 'topdown', 'grid']);
const ROLES = z.enum(['hostile', 'collectible', 'relic', 'key', 'door', 'crate', 'target', 'plot', 'shop', 'bin', 'bed']);

/**
 * What a bespoke system (game/src/systems/<id>.ts) does, in the terms the composition rules and the conformance check
 * read: the keys it reads, what it owns in the game (the win, the death rule, the movement, combat, the types it spawns),
 * what it needs, the events it emits and the HUD keys it writes. The game's own test holds the code to it.
 */
export const Mechanic = z.object({
  id: Id,
  summary: z.string().min(1).max(200),
  /** What it does with each key it reads ("action": "flip the switch"). */
  controls: z.partialRecord(z.enum(INPUT_KEYS), z.string().min(1).max(40)).optional(),
  provides: z
    .object({
      movement: MOVEMENT.optional(),
      /** The won flag: a bespoke win needs a progress hook. Most games leave the win to the objectives system. */
      win: z.enum(['reach_goal', 'survive', 'clear_room', 'place_crates', 'earn', 'objectives']).optional(),
      death: z.enum(['respawn', 'game_over', 'lives']).optional(),
      combat: z.enum(['stomp', 'melee', 'shoot', 'aura']).optional(),
      /** Entity types it spawns, all of them the game's own. */
      spawns: z.array(Id).max(8).optional(),
    })
    .optional(),
  requires: z
    .object({
      movement: z.array(MOVEMENT).max(3).optional(),
      roles: z.array(ROLES).max(8).optional(),
      content: z.array(Id).max(8).optional(),
      systems: z.array(Id).max(8).optional(),
    })
    .optional(),
  emits: z.array(MechanicEvent).max(16).default([]),
  /** HUD keys it writes (world.hud); one starting with _ is for the view, never shown. */
  hud: z.array(z.string().regex(/^_?[a-z][a-z0-9_]{0,23}$/, 'a lowercase HUD key')).max(8).default([]),
});
export type Mechanic = z.infer<typeof Mechanic>;

/** design/mechanics.json: the contracts of a game's bespoke systems, one for each system in src/systems/index.ts. */
export const MechanicsFile = z
  .object({
    version: z.literal(1),
    mechanics: z.array(Mechanic).max(8),
  })
  .refine((f) => new Set(f.mechanics.map((m) => m.id)).size === f.mechanics.length, { message: 'mechanic ids must be unique', path: ['mechanics'] });
export type MechanicsFile = z.infer<typeof MechanicsFile>;
