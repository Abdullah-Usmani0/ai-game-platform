import { z } from 'zod';
import { Id } from './common';

/** A shipped entity of a curated genre, '<genre>:<type>' ('topdown-action:grunt'). */
export const Archetype = z.string().regex(/^[a-z][a-z-]*:[a-z][a-z0-9_-]*$/, "an archetype is '<genre>:<type>'");

/** One entity type of a freeform game: its own name for a shipped entity, tuned within bounds. */
export const RosterEntry = z.object({
  /** The game's name for the type: what its levels, waves, behaviours and objectives call it. */
  type: Id,
  /** The shipped entity it is, from a curated genre that moves the way the game's base does. */
  archetype: Archetype,
  /** Health relative to the archetype's (rounded, at least 1). */
  hp: z.number().min(0.5).max(3).default(1),
});
export type RosterEntry = z.infer<typeof RosterEntry>;

/**
 * content/entities.json: the entity types of a freeform game. Each names the shipped entity it is, so it keeps that
 * entity's body, behaviour and art under the game's own name; base entities it does not rename keep theirs.
 */
export const EntityRoster = z
  .object({
    version: z.literal(1),
    designNotes: z.string().max(400).default(''),
    /** The player's health, when not the base genre's. */
    player: z.object({ hp: z.int().min(1).max(12).optional() }).default({}),
    types: z.array(RosterEntry).max(40),
  })
  .superRefine((r, ctx) => {
    const types = new Set<string>();
    const archetypes = new Set<string>();
    r.types.forEach((t, i) => {
      if (t.type === 'player') ctx.addIssue({ code: 'custom', message: "'player' is the player's own type", path: ['types', i, 'type'] });
      if (types.has(t.type)) ctx.addIssue({ code: 'custom', message: `type '${t.type}' is listed twice`, path: ['types', i, 'type'] });
      // A level of the base genre names each shipped entity once, so renaming one two ways would be ambiguous.
      if (archetypes.has(t.archetype)) ctx.addIssue({ code: 'custom', message: `archetype '${t.archetype}' plays two parts`, path: ['types', i, 'archetype'] });
      types.add(t.type);
      archetypes.add(t.archetype);
    });
  });
export type EntityRoster = z.infer<typeof EntityRoster>;
