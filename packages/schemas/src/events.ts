import { z } from 'zod';

/** Fixed semantic event table every generated game emits through ctx.events. */
export const GAME_EVENTS = [
  'level_start',
  'level_complete',
  'checkpoint',
  'jump',
  'land',
  'dash',
  'hit',
  'damage',
  'death',
  'pickup',
  'score',
  'spawn',
  'despawn',
  'ui_open',
  'ui_close',
  'audio_play',
  'feedback',
] as const;
export const GameEventName = z.enum(GAME_EVENTS);
export type GameEventName = z.infer<typeof GameEventName>;

export const FEEDBACK_CHANNELS = ['shake', 'hitstop', 'flash', 'particle', 'sfx'] as const;
export const FeedbackChannel = z.enum(FEEDBACK_CHANNELS);
export type FeedbackChannel = z.infer<typeof FeedbackChannel>;

export const GameEventRecord = z.object({
  tick: z.int().nonnegative(),
  name: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type GameEventRecord = z.infer<typeof GameEventRecord>;
