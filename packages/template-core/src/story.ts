import type { DialogueFile, FeedbackChannel } from '@gg/schemas';

/**
 * The feedback a game's story needs, so each of its own events is heard: a talk begun (custom:talk) where people talk,
 * a quest told (custom:quest) where it has quests, the ending played (custom:ending) where it has endings. The story
 * stage binds them as it writes a talk; the scaffold binds them for a talk a game ships.
 */
export function storyFeedback(d: Pick<DialogueFile, 'starts' | 'quests' | 'endings'>): Array<{ event: string; channels: FeedbackChannel[] }> {
  const want: Array<[boolean, string]> = [
    [d.starts.length > 0, 'custom:talk'],
    [(d.quests ?? []).length > 0, 'custom:quest'],
    [(d.endings ?? []).length > 0, 'custom:ending'],
  ];
  return want.flatMap(([needed, event]) => (needed ? [{ event, channels: ['sfx'] as FeedbackChannel[] }] : []));
}
