import { z } from 'zod';

/** One-tag ratings: a player picks the single word that fits best. Broken games never stay in the feed. */
export const RATING_TAGS = ['fun', 'confusing', 'broken', 'ugly'] as const;
export const RatingTag = z.enum(RATING_TAGS);
export type RatingTag = z.infer<typeof RatingTag>;

/** Where a play came from. Curated surfaces, search, testers and the creator's workspace do not count toward rank. */
export const PLAY_SOURCES = ['feed', 'direct', 'remix', 'featured', 'search', 'test', 'workspace'] as const;
export const PlaySource = z.enum(PLAY_SOURCES);
export type PlaySource = z.infer<typeof PlaySource>;

/** What a play page reports when a session ends (sent with sendBeacon on pagehide). */
export const PlayReport = z.object({
  gameId: z.string().min(1).max(64),
  versionId: z.string().min(1).max(64),
  source: PlaySource.default('direct'),
  durationS: z.number().min(0).max(4 * 3600),
  completed: z.boolean().default(false),
  levelsCompleted: z.int().min(0).max(100).default(0),
  deaths: z.int().min(0).max(100000).default(0),
});
export type PlayReport = z.infer<typeof PlayReport>;

export const RatingInput = z.object({
  tag: RatingTag,
  /** Optional 1-5 score alongside the tag. */
  score: z.int().min(1).max(5).optional(),
});
export type RatingInput = z.infer<typeof RatingInput>;

export const TEST_VERDICTS = ['works', 'broken'] as const;
export const TestVerdict = z.enum(TEST_VERDICTS);
export type TestVerdict = z.infer<typeof TestVerdict>;

/** A tester's report on an unreleased game: does it work, the one tag that fits, and a short note. */
export const TestSubmission = z.object({
  verdict: TestVerdict,
  tag: RatingTag,
  note: z.string().max(500).default(''),
});
export type TestSubmission = z.infer<typeof TestSubmission>;

export const TestRequest = z.object({
  needed: z.int().min(1).max(10).default(3),
  rewardCredits: z.int().min(0).max(100).default(5),
});
export type TestRequest = z.infer<typeof TestRequest>;
