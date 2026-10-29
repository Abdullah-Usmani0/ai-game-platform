import { z } from 'zod';
import { Genre } from './common';

/** One-tag ratings: a player picks the single word that fits best. Broken games never stay in the feed. */
export const RATING_TAGS = ['fun', 'confusing', 'broken', 'ugly'] as const;
export const RatingTag = z.enum(RATING_TAGS);
export type RatingTag = z.infer<typeof RatingTag>;

/** Where a play came from. Curated surfaces, search, testers and the creator's workspace do not count toward rank. */
export const PLAY_SOURCES = ['feed', 'direct', 'remix', 'featured', 'search', 'test', 'workspace'] as const;
export const PlaySource = z.enum(PLAY_SOURCES);
export type PlaySource = z.infer<typeof PlaySource>;

/**
 * Where something happened in a play, for the creator's heatmaps: a player death, the last position before leaving a
 * game unfinished, or a position sample every few seconds (dense cells are where players linger or get stuck).
 */
export const PLAY_EVENT_KINDS = ['death', 'quit', 'sample'] as const;
export const PlayEventKind = z.enum(PLAY_EVENT_KINDS);
export type PlayEventKind = z.infer<typeof PlayEventKind>;

/** What one play may carry (a beacon holds at most 64 KB): 20 minutes of samples, 200 deaths and the quit point. */
export const PLAY_EVENT_LIMITS = { sampleEveryS: 3, samples: 400, deaths: 200, total: 601 } as const;

export const PlayEvent = z.object({
  kind: PlayEventKind,
  /** The level id the game reported. */
  level: z.string().min(1).max(64),
  /** World position in pixels (the player's top-left corner). */
  x: z.number().min(-1e6).max(1e6),
  y: z.number().min(-1e6).max(1e6),
  /** Seconds of active play when it happened. */
  t: z.number().min(0).max(4 * 3600),
});
export type PlayEvent = z.infer<typeof PlayEvent>;

/** What a play page reports when a session ends (sent with sendBeacon on pagehide). */
export const PlayReport = z.object({
  gameId: z.string().min(1).max(64),
  versionId: z.string().min(1).max(64),
  source: PlaySource.default('direct'),
  durationS: z.number().min(0).max(4 * 3600),
  completed: z.boolean().default(false),
  levelsCompleted: z.int().min(0).max(100).default(0),
  deaths: z.int().min(0).max(100000).default(0),
  events: z.array(PlayEvent).max(PLAY_EVENT_LIMITS.total).default([]),
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

/** What a player can report about a game. Reports are reviewed by moderators; ip and abuse can suspend a game early. */
export const REPORT_KINDS = ['ip', 'abuse', 'broken', 'other'] as const;
export const ReportKind = z.enum(REPORT_KINDS);
export type ReportKind = z.infer<typeof ReportKind>;

export const ReportInput = z.object({
  kind: ReportKind,
  note: z.string().max(1000).default(''),
  /** ip only: the reporter says they hold the rights. */
  rightsHolder: z.boolean().default(false),
});
export type ReportInput = z.infer<typeof ReportInput>;

/**
 * A moderator's decision, mildest first. dismiss: no action. unlist: out of the feed until the owner publishes a new
 * version, no strike (a confirmed broken report). warn: strike the owner, the game stays (not for broken reports: a
 * broken game is not misconduct). license: an ip claim settled by licence (the game stays, terms are recorded).
 * remove: take the game down (state removed, unlisted, no remixes) and strike the owner. unlist and remove close every
 * open report on the game.
 */
export const REPORT_RESOLUTIONS = ['dismiss', 'unlist', 'warn', 'license', 'remove'] as const;
export const ReportResolution = z.enum(REPORT_RESOLUTIONS);
export type ReportResolution = z.infer<typeof ReportResolution>;

export const ResolveInput = z.object({
  resolution: ReportResolution,
  note: z.string().max(1000).default(''),
});
export type ResolveInput = z.infer<typeof ResolveInput>;

/**
 * A removed game's owner asks for it back. For an ip takedown this is a DMCA counter-notice: a statement under
 * penalty of perjury that the material was removed by mistake or misidentification, name and contact, and consent
 * to the jurisdiction of the courts and to accept service from the claimant (17 U.S.C. 512(g)(3)). The game can be
 * restored 14 days after it is filed unless the claimant goes to court. Any other removal takes a plain appeal.
 */
export const AppealInput = z.object({
  statement: z.string().min(20).max(2000),
  name: z.string().min(1).max(120),
  email: z.email().max(200),
  /** Required for ip takedowns: consent to jurisdiction and to accept service of process from the claimant. */
  consent: z.boolean().default(false),
});
export type AppealInput = z.infer<typeof AppealInput>;

export const APPEAL_DECISIONS = ['reinstate', 'uphold'] as const;
export const AppealDecision = z.object({
  decision: z.enum(APPEAL_DECISIONS),
  note: z.string().max(1000).default(''),
});
export type AppealDecision = z.infer<typeof AppealDecision>;

/**
 * A jam: a theme and three moments. Entries open at startsAt (only games made after it count), submissions close and
 * voting starts at submissionsClose, results are published at votingClose. genres empty means any genre.
 */
export const JamInput = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/, 'slug: 3-40 of a-z, 0-9 and -'),
    title: z.string().min(3).max(80),
    theme: z.string().min(2).max(80),
    description: z.string().max(2000).default(''),
    genres: z.array(Genre).max(9).default([]),
    startsAt: z.iso.datetime({ offset: true }),
    submissionsClose: z.iso.datetime({ offset: true }),
    votingClose: z.iso.datetime({ offset: true }),
  })
  .refine((j) => Date.parse(j.startsAt) < Date.parse(j.submissionsClose) && Date.parse(j.submissionsClose) < Date.parse(j.votingClose), 'the jam must start, close submissions and close voting in that order');
export type JamInput = z.infer<typeof JamInput>;

/** A moderator moves a jam's moments (extend submissions, close voting early); omitted ones stay. */
export const JamSchedule = z.object({
  startsAt: z.iso.datetime({ offset: true }).optional(),
  submissionsClose: z.iso.datetime({ offset: true }).optional(),
  votingClose: z.iso.datetime({ offset: true }).optional(),
});
export type JamSchedule = z.infer<typeof JamSchedule>;

/** What a jam entry is scored on, 1 to 5 each: is it fun, does it use the theme, how does it look and sound. */
export const JAM_CRITERIA = ['fun', 'theme', 'look'] as const;
export const JamVote = z.object({
  fun: z.int().min(1).max(5),
  theme: z.int().min(1).max(5),
  look: z.int().min(1).max(5),
});
export type JamVote = z.infer<typeof JamVote>;

