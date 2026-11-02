import { z } from 'zod';
import { Id } from './common';
import { MechanicEvent } from './mechanics';

/**
 * A game's talk, content/dialogue.json: what its people say, the answers the player can give, and the story's flags.
 * A flag lives on the player as the prop `f:<flag>`, so a save keeps it and the next region sees it. The flags decide
 * the rest: which talks and answers are offered, how the story ends, and which quests are under way or done; deeds
 * set them from what the player does.
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

/**
 * How the story can end. When the game is won, the first ending whose tests hold is the player's, and its node is read
 * as the epilogue. The last ending has no tests: the one every player reaches when no other holds.
 */
export const DialogueEnding = z.object({
  id: Id,
  /** Its name, shown as the game ends. */
  title: z.string().min(1).max(40),
  when: z.array(FlagTest).max(4).optional(),
  /** The epilogue: the node read as the game ends (said by the narrator, or by one of the cast). */
  node: Id,
});
export type DialogueEnding = z.infer<typeof DialogueEnding>;

/** A side goal with a name: under way once every `start` test holds, done once every `done` test holds as well. */
export const Quest = z.object({
  id: Id,
  title: z.string().min(1).max(40),
  start: z.array(FlagTest).min(1).max(4),
  done: z.array(FlagTest).min(1).max(4),
});
export type Quest = z.infer<typeof Quest>;

/** Something the player does that the story remembers: an event of the game (about one type, if given) sets flags. */
export const Deed = z.object({
  /** The event: `death` (a foe beaten), `pickup` (a relic, an item), or one of the game's own (`custom:door_open`). */
  on: MechanicEvent,
  /** Only events about this type: the foe beaten, the thing picked up. */
  type: Id.optional(),
  set: FlagSet,
});
export type Deed = z.infer<typeof Deed>;

export const DialogueFile = z.object({
  version: z.literal(1),
  /** The cast's names as shown over their lines, by speaker id. */
  names: z.record(Id, z.string().min(1).max(32)).default({}),
  nodes: z.array(DialogueNode).min(1).max(96),
  starts: z.array(DialogueStart).min(1).max(48),
  /** How the story ends, tried in order; the last is the default. None: the game ends without an epilogue. */
  endings: z.array(DialogueEnding).max(4).optional(),
  quests: z.array(Quest).max(8).optional(),
  deeds: z.array(Deed).max(16).optional(),
});
export type DialogueFile = z.infer<typeof DialogueFile>;

/** Whether every test holds on a player's props (`f:<flag>`; a flag never set is false). */
export function flagsHold(tests: readonly FlagTest[] | undefined, props: Readonly<Record<string, unknown>>): boolean {
  return (tests ?? []).every((t) => (props[`f:${t.flag}`] === true) === t.is);
}

/** Where a quest was last told to stand, kept as a player prop: `q:<id>` is 'on' or 'done' (absent: not begun). */
export const QUEST_PREFIX = 'q:';

/**
 * Events a deed may not listen to: the page alone emits them (scenes opening and closing, the feedback it plays), so a
 * story that heard them would set different flags in the browser than when its runs are replayed.
 */
export const UNSTABLE_DEED_EVENTS: readonly string[] = ['ui_open', 'ui_close', 'feedback', 'audio_play'];

/** The ending a player's flags reach: the first whose tests hold (null for a game with no endings). */
export function endingFor(file: Pick<DialogueFile, 'endings'>, props: Readonly<Record<string, unknown>>): DialogueEnding | null {
  return (file.endings ?? []).find((e) => flagsHold(e.when, props)) ?? null;
}

/** Where a quest stands on a player's flags: not begun, under way, or done (a quest never begun is never done). */
export function questState(quest: Quest, props: Readonly<Record<string, unknown>>): 'none' | 'on' | 'done' {
  if (!flagsHold(quest.start, props)) return 'none';
  return flagsHold(quest.done, props) ? 'done' : 'on';
}
