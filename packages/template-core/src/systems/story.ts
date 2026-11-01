import { DialogueFile, questState, type Deed, type Quest } from '@gg/schemas';
import { defineSystem } from '@gg/sdk';

interface StoryState {
  /** The game's deeds and quests (content/dialogue.json), none when it has no talk. */
  deeds: Deed[];
  quests: Quest[];
}

/** Where a quest was last told to stand, as a player prop: `q:<id>` is 'on' or 'done' (absent: not begun). */
export const QUEST_PREFIX = 'q:';

/**
 * The story keeps count (content/dialogue.json). Its deeds turn what the player does into flags: a foe beaten, a
 * relic found, a grate opened. Its quests are told as they begin and as they end (custom:quest), whatever set the
 * flags: an answer, a node read, a deed. Where each quest stands is kept on the player (`q:<id>`), so rests, reloads
 * and saves keep it and nothing is told twice. Every flag is set with an event in the same step (the talk's own, or the
 * deed's), so the events are where the story looks. The ending the flags reach is played as the game ends (Sim.end).
 */
export const story = defineSystem<StoryState>({
  id: 'story',
  init: (ctx) => {
    const parsed = DialogueFile.safeParse(ctx.content['dialogue']);
    return { deeds: parsed.success ? (parsed.data.deeds ?? []) : [], quests: parsed.success ? (parsed.data.quests ?? []) : [] };
  },
  fixedUpdate() {},
  onEvent(s, ev, ctx) {
    const p = ctx.world.player;
    for (const d of s.deeds) {
      if (d.on !== ev.name || (d.type !== undefined && ev.payload['type'] !== d.type)) continue;
      for (const [flag, value] of Object.entries(d.set)) p.props[`f:${flag}`] = value;
    }
    for (const q of s.quests) {
      const state = questState(q, p.props);
      if (state === 'none' || p.props[`${QUEST_PREFIX}${q.id}`] === state) continue;
      p.props[`${QUEST_PREFIX}${q.id}`] = state;
      ctx.emit('custom:quest', { quest: q.id, title: q.title, state });
    }
  },
});

export const meta = {
  id: 'story',
  genres: ['castle'],
  summary:
    "The story keeps count: what the player does sets the story's flags (content/dialogue.json's deeds: a foe beaten, a relic found, a grate opened), and its quests are told as they begin and as they end. As the game ends, the ending the flags reach is played.",
  params: {},
  emits: ['custom:quest'],
  feedbackFor: ['custom:quest'],
  controls: {},
  hud: [],
} as const;
