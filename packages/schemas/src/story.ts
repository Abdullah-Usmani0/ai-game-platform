import { z } from 'zod';
import { Id } from './common';

/**
 * A game's story as the story stage plans it from the idea (design/story.json): how much story the idea wants, who it
 * is about and where, what happens in each level's chapter, and how it can end. The talk itself (content/dialogue.json)
 * is written from it. It stays with the game's makers: it is not published with the game.
 */
export const StoryBible = z.object({
  version: z.literal(1),
  /**
   * How much story the idea wants. none: the play speaks for itself, and no talk is written. light: a prologue, a line
   * for each level and an ending. rich: people to talk to, quests, and endings that follow what the player did.
   */
  depth: z.enum(['none', 'light', 'rich']),
  premise: z.string().min(1).max(400),
  setting: z.string().min(1).max(300),
  protagonist: z.string().min(1).max(200),
  tone: z.string().min(1).max(120),
  /** The story's people; those the player can talk to are the game's own, by the speaker ids it gives them. */
  cast: z.array(z.object({ id: Id, name: z.string().min(1).max(32), role: z.string().min(1).max(200) })).max(8).default([]),
  /** A chapter for each level, from 1: its title and what happens in it. */
  chapters: z.array(z.object({ level: z.int().min(1).max(20), title: z.string().min(1).max(40), beat: z.string().min(1).max(240) })).max(20).default([]),
  /** How the story can end, in prose, the one every other player reaches last. */
  endings: z.array(z.object({ title: z.string().min(1).max(40), how: z.string().min(1).max(240) })).max(4).default([]),
});
export type StoryBible = z.infer<typeof StoryBible>;
