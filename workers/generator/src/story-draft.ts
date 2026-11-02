import { DialogueFile, StoryBible, type AnyGddFrontmatter } from '@gg/schemas';
import type { GenreManifest } from '@gg/template-core';

/** Words that say an idea wants a story told. An idea with none of them gets none in a dry run. */
const STORY_WORDS = /\b(story|stories|tale|tales|legend|saga|fable|quest|quests|chapter|chapters|prologue|epilogue|ending|endings|villager|villagers|talk|talks|dialogue|narrat\w*)\b/i;

/** Whether an idea asks for a story in so many words. */
export function wantsStory(idea: string): boolean {
  return STORY_WORDS.test(idea);
}

export interface DraftedStory {
  bible: StoryBible;
  /** The talk it is told in, or null for a story the play tells alone (depth none). */
  dialogue: DialogueFile | null;
}

/**
 * The story a game tells when no model writes it: a dry run's answer, and the example the story stage shows the model.
 * - A genre that ships a talk of its own (the castle's hermit, keeper, grate and endings) tells that: a rich story. So
 *   does a composed game with people to talk to whose idea asks for a story, when the hand-made game it was composed
 *   after tells one (`example`: the lost dog's villagers).
 * - Another game whose idea asks for a story tells a light one: a prologue, a chapter named for each level, an ending.
 * - An idea that asks for none gets none: the play speaks for itself, as it always has.
 */
export function draftStory(input: { genre: GenreManifest; gdd: AnyGddFrontmatter; levels: number; idea: string; example?: DialogueFile | null }): DraftedStory {
  const { genre: g, gdd, levels } = input;
  const shipped = DialogueFile.safeParse(g.shippedContent?.['dialogue']);
  const premise = `${gdd.title}: ${gdd.pillars.join('; ')}.`.slice(0, 400);
  const own = shipped.success ? shipped.data : input.example && wantsStory(input.idea) ? input.example : null;
  if (own) {
    const talk = own;
    return {
      bible: StoryBible.parse({
        version: 1,
        depth: 'rich',
        premise,
        setting: `the world of ${gdd.title}`,
        protagonist: 'the one the player plays',
        tone: 'quiet and grave',
        cast: Object.entries(talk.names).map(([id, name]) => ({ id, name, role: `speaks as ${id}` })),
        chapters: (talk.chapters ?? []).map((c) => ({ level: c.level, title: c.title ?? gdd.title, beat: 'the way through' })),
        endings: (talk.endings ?? []).map((e) => ({ title: e.title, how: (e.when ?? []).length ? `when ${(e.when ?? []).map((t) => `${t.flag} is ${t.is ? 'set' : 'not set'}`).join(' and ')}` : 'otherwise' })),
      }),
      dialogue: talk,
    };
  }
  const none = StoryBible.parse({ version: 1, depth: 'none', premise, setting: `the world of ${gdd.title}`, protagonist: 'the one the player plays', tone: 'light' });
  if (!wantsStory(input.idea)) return { bible: none, dialogue: null };
  const count = Math.max(1, Math.min(20, levels));
  const titleOf = (i: number) => (gdd.pillars[i % gdd.pillars.length] ?? `Part ${i + 1}`).replace(/[^A-Za-z0-9 ,'-]/g, '').slice(0, 40).trim() || `Part ${i + 1}`;
  const dialogue = DialogueFile.parse({
    version: 1,
    nodes: [
      { id: 'prologue', speaker: 'narrator', lines: [`This is the story of ${gdd.title}.`.slice(0, 160), `It begins with this: ${gdd.pillars[0] ?? 'a first step'}.`.slice(0, 160)] },
      { id: 'epilogue', speaker: 'narrator', lines: [`And so ${gdd.title} comes to its end.`.slice(0, 160)] },
    ],
    chapters: Array.from({ length: count }, (_, i) => ({ level: i + 1, title: titleOf(i), ...(i === 0 ? { node: 'prologue' } : {}) })),
    endings: [{ id: 'end', title: gdd.title.slice(0, 40), node: 'epilogue' }],
  });
  return {
    bible: StoryBible.parse({
      ...none,
      depth: 'light',
      chapters: Array.from({ length: count }, (_, i) => ({ level: i + 1, title: titleOf(i), beat: i === 0 ? 'where it begins' : 'the way on' })),
      endings: [{ title: gdd.title.slice(0, 40), how: 'the last level won' }],
    }),
    dialogue,
  };
}
