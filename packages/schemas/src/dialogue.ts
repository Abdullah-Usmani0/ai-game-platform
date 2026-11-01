import { z } from 'zod';
import { Id } from './common';

/**
 * A game's talk, content/dialogue.json: what its people say, the answers the player can give, and the story's flags.
 * A flag lives on the player as the prop `f:<flag>`, so a save keeps it and the next region sees it.
 */

/** A test of a story flag: the flag, and the value it must hold (a flag never set is false). */
export const FlagTest = z.object({ flag: Id, is: z.boolean() });
export type FlagTest = z.infer<typeof FlagTest>;

/** Flags set, by name. */
export const FlagSet = z.record(Id, z.boolean());
export type FlagSet = z.infer<typeof FlagSet>;

/** One answer the player can give after a node's last line. */
export const DialogueChoice = z.object({
  label: z.string().min(1).max(48),
  /** The node read next. */
  to: Id,
  /** Flags this answer sets. */
  set: FlagSet.optional(),
  /** Offered only while every test holds. */
  when: z.array(FlagTest).max(4).optional(),
});
export type DialogueChoice = z.infer<typeof DialogueChoice>;

/** A run of lines one speaker says, then the answers to it, or the node after it, or the end of the talk. */
export const DialogueNode = z.object({
  id: Id,
  /** Who speaks: a member of the cast by id (`names` shows it), or `narrator`. */
  speaker: Id,
  lines: z.array(z.string().min(1).max(160)).min(1).max(6),
  /** Up to four answers, offered after the last line. */
  choices: z.array(DialogueChoice).max(4).default([]),
  /** The node read next when there are no answers (none: the talk ends). */
  next: Id.optional(),
  /** Flags set once the node is read. */
  set: FlagSet.optional(),
});
export type DialogueNode = z.infer<typeof DialogueNode>;

/** Where a talk with someone begins: the first start of theirs whose tests hold. */
export const DialogueStart = z.object({
  /** The speaker an NPC talks as: its `speaker` prop, else its type. */
  speaker: Id,
  node: Id,
  when: z.array(FlagTest).max(4).optional(),
});
export type DialogueStart = z.infer<typeof DialogueStart>;

export const DialogueFile = z.object({
  version: z.literal(1),
  /** The cast's names as shown over their lines, by speaker id. */
  names: z.record(Id, z.string().min(1).max(32)).default({}),
  nodes: z.array(DialogueNode).min(1).max(96),
  starts: z.array(DialogueStart).min(1).max(48),
});
export type DialogueFile = z.infer<typeof DialogueFile>;

/** Whether every test holds on a player's props (`f:<flag>`; a flag never set is false). */
export function flagsHold(tests: readonly FlagTest[] | undefined, props: Readonly<Record<string, unknown>>): boolean {
  return (tests ?? []).every((t) => (props[`f:${t.flag}`] === true) === t.is);
}
