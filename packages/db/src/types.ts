import type { ModelPolicy, PlaySource, RatingTag, ReportInput, ReportKind, ReportResolution, ResolveInput, TestSubmission, TestVerdict, Trajectory } from '@gg/schemas';

export type JobKind = 'create' | 'edit_parameter' | 'edit_style' | 'edit_behaviour' | 'edit_content' | 'edit_code' | 'remix' | 'republish';
export type JobStatus = 'queued' | 'running' | 'waiting_assets' | 'needs_human' | 'succeeded' | 'failed' | 'cancelled';
export type JobEventType =
  | 'stage_started'
  | 'gate_passed'
  | 'gate_failed'
  | 'retry'
  | 'escalation'
  | 'checkpoint'
  | 'cost'
  | 'warning'
  | 'assistant_summary'
  | 'needs_human'
  | 'finished';

export interface JobRow {
  id: string;
  gameId: string;
  userId: string;
  kind: JobKind;
  status: JobStatus;
  stage: string | null;
  stages: Record<string, unknown>;
  input: Record<string, unknown>;
  baseVersionId: string | null;
  resultVersionId: string | null;
  policyVersion: number;
  budgetUsdCap: number;
  costUsd: number;
  providerCostUsd: number;
  turns: number;
  priority: number;
  workerId: string | null;
  attempts: number;
  error: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobEvent {
  jobId: string;
  seq: number;
  ts: string;
  stage: string | null;
  type: JobEventType;
  payload: Record<string, unknown>;
}

export interface VersionRow {
  id: string;
  gameId: string;
  number: number;
  kind: 'stage' | 'accepted' | 'published';
  stage: string | null;
  parentVersionId: string | null;
  jobId: string | null;
  sourcePath: string | null;
  bundlePath: string | null;
  manifest: Record<string, unknown> | null;
  design: Record<string, unknown>;
  gateResults: Record<string, unknown>;
  evidence: Record<string, unknown>;
  engineVersion: string | null;
  contentHash: string | null;
  costUsd: number;
  policyVersion: number | null;
  isHead: boolean;
  createdAt: string;
}

/** A version to insert; `id` may be supplied so a publisher can name the bundle after it before the row exists. */
export type NewVersion = Omit<VersionRow, 'id' | 'number' | 'createdAt' | 'isHead'> & { id?: string };

export type GameVisibility = 'private' | 'unlisted' | 'listed';
export type GameState = 'draft' | 'generating' | 'playable' | 'published' | 'suspended' | 'removed';

export interface GameRow {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  genre: string;
  visibility: GameVisibility;
  state: GameState;
  headVersionId: string | null;
  conceptMd: string | null;
  concept: Record<string, unknown> | null;
  listing: Record<string, unknown>;
  originVersionId: string | null;
  rootGameId: string | null;
  remixDepth: number;
  stats: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type NewGame = Pick<GameRow, 'ownerId' | 'slug' | 'title' | 'genre'> & Partial<Pick<GameRow, 'id' | 'conceptMd' | 'concept' | 'visibility' | 'state' | 'listing'>>;

export interface LineageRow {
  gameId: string;
  ancestorGameId: string;
  depth: number;
  forkedFromVersionId: string | null;
}

export interface PlayRow {
  id: string;
  gameId: string;
  versionId: string;
  userId: string;
  source: PlaySource;
  durationS: number;
  completed: boolean;
  levelsCompleted: number;
  deaths: number;
  createdAt: string;
}
export type NewPlay = Omit<PlayRow, 'id' | 'createdAt'>;

export interface RatingRow {
  gameId: string;
  userId: string;
  tag: RatingTag;
  score: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A game's community signals, aggregated per player (see ranking.ts for the formula). */
export interface GameStats {
  gameId: string;
  players: number;
  qualifiedPlayers: number;
  plays: number;
  completionRate: number;
  avgPlayMin: number;
  ratings: Record<RatingTag, number>;
  ratingCount: number;
  remixes: number;
  engagement: number;
  quality: number;
  rankScore: number;
  /** Rated broken by too many players, or a test round concluded broken: kept out of the feed. */
  broken: boolean;
  computedAt: string;
}

export interface FeedItem {
  game: GameRow;
  head: VersionRow;
  stats: GameStats;
}

export type TestQueueStatus = 'open' | 'closed';

/** A request for testers to play an unreleased version; closes when `needed` reports are in. */
export interface TestQueueRow {
  id: string;
  gameId: string;
  versionId: string;
  requestedBy: string;
  needed: number;
  rewardCredits: number;
  status: TestQueueStatus;
  /** Majority verdict once closed (a tie counts as broken). */
  outcome: TestVerdict | null;
  createdAt: string;
  closedAt: string | null;
}

export interface TestAssignmentRow {
  id: string;
  queueId: string;
  gameId: string;
  versionId: string;
  testerId: string;
  claimedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  verdict: TestVerdict | null;
  tag: RatingTag | null;
  note: string;
  rewardPaid: number;
}

export interface CreditEntry {
  userId: string;
  delta: number;
  reason: 'test_reward' | 'purchase' | 'generation' | 'edit' | 'refund' | 'admin';
  refId: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface ReportRow {
  id: string;
  gameId: string;
  versionId: string | null;
  reporterId: string;
  kind: ReportKind;
  note: string;
  rightsHolder: boolean;
  status: 'open' | 'resolved';
  resolution: ReportResolution | null;
  resolvedBy: string | null;
  resolutionNote: string;
  createdAt: string;
  resolvedAt: string | null;
}

/** A strike against a game owner from an actioned report; active for 90 days. Three active strikes block listing. */
export interface StrikeRow {
  id: string;
  userId: string;
  reportId: string;
  gameId: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
}

/** The public audit trail of a removal or a licence settlement. */
export interface TakedownRow {
  id: string;
  gameId: string;
  reportId: string;
  action: 'removed' | 'licensed';
  terms: string;
  moderatorId: string;
  createdAt: string;
}

/**
 * The only persistence surface workers use. Two implementations: Supabase (production)
 * and a JSON file store (local development, demos, tests without credentials).
 */
export interface Store {
  claimJob(workerId: string): Promise<JobRow | null>;
  getJob(jobId: string): Promise<JobRow | null>;
  enqueueJob(job: Pick<JobRow, 'gameId' | 'userId' | 'kind'> & Partial<Pick<JobRow, 'input' | 'priority' | 'policyVersion' | 'budgetUsdCap' | 'baseVersionId'>>): Promise<JobRow>;
  updateJob(jobId: string, patch: Partial<Omit<JobRow, 'id'>>): Promise<void>;
  appendEvent(jobId: string, type: JobEventType, payload?: Record<string, unknown>, stage?: string | null): Promise<JobEvent>;
  listEvents(jobId: string): Promise<JobEvent[]>;
  insertVersion(v: NewVersion): Promise<VersionRow>;
  acceptVersion(versionId: string): Promise<void>;
  insertTrajectory(t: Trajectory): Promise<void>;
  listTrajectories(jobId: string): Promise<Trajectory[]>;
  activePolicy(): Promise<ModelPolicy>;
  /** Upload a file (checkpoint tarball, report, screenshot) and return its storage path. */
  putObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  getObject(bucket: string, path: string): Promise<Uint8Array>;
  createGame(g: NewGame): Promise<GameRow>;
  getGame(gameId: string): Promise<GameRow | null>;
  getGameBySlug(slug: string): Promise<GameRow | null>;
  listGames(opts?: { ownerId?: string; limit?: number }): Promise<GameRow[]>;
  updateGame(gameId: string, patch: Partial<Omit<GameRow, 'id'>>): Promise<void>;
  getVersion(versionId: string): Promise<VersionRow | null>;
  listVersions(gameId: string): Promise<VersionRow[]>;
  listJobs(gameId: string): Promise<JobRow[]>;
  /**
   * Remix: a new game whose accepted head is a copy of the origin version (same checkpoint and bundle),
   * with lineage recorded. Edits on the remix start from that checkpoint.
   */
  forkGame(originVersionId: string, opts: { ownerId: string; slug: string; title: string }): Promise<GameRow>;
  listLineage(gameId: string): Promise<LineageRow[]>;

  // ---- community (phase 3) ----
  /** Record a finished play session. Plays by the owner and from curated, search, test or workspace traffic do not rank. */
  recordPlay(play: NewPlay): Promise<PlayRow>;
  /** One rating per player per game; rating again replaces the tag. */
  rateGame(gameId: string, userId: string, rating: { tag: RatingTag; score?: number }): Promise<RatingRow>;
  getRating(gameId: string, userId: string): Promise<RatingRow | null>;
  gameStats(gameId: string): Promise<GameStats>;
  /** Listed, playable games whose head passed its gates and is not broken, ranked by rank score. */
  listFeed(opts?: { limit?: number }): Promise<FeedItem[]>;
  /**
   * List the game (or unlist it). Listing needs an accepted head whose playtest passed, no broken test verdict and no
   * moderator unlisting of that head, a game neither suspended nor removed, and an owner with fewer than three strikes.
   */
  setListed(gameId: string, listed: boolean): Promise<GameRow>;
  enqueueTest(input: { gameId: string; versionId: string; requestedBy: string; needed?: number; rewardCredits?: number }): Promise<TestQueueRow>;
  listTests(gameId: string): Promise<{ queue: TestQueueRow[]; assignments: TestAssignmentRow[] }>;
  /** The tester's open assignment, or a new one on the oldest open request that is not their own game. */
  claimTest(testerId: string): Promise<{ assignment: TestAssignmentRow; queue: TestQueueRow } | null>;
  /** Needs a test play of at least 30 s since the claim; pays the reward and closes the request when enough reports are in. */
  submitTest(assignmentId: string, testerId: string, report: TestSubmission): Promise<{ assignment: TestAssignmentRow; queue: TestQueueRow }>;
  creditBalance(userId: string): Promise<number>;

  // ---- moderation (phase 3) ----
  /**
   * One open report per player, game and kind (reporting again updates the note). The owner cannot report their game.
   * Open ip, abuse or broken reports from three different players suspend the game (out of the feed) until review.
   */
  reportGame(gameId: string, reporterId: string, report: ReportInput): Promise<{ report: ReportRow; suspended: boolean }>;
  listReports(opts?: { status?: 'open' | 'resolved'; gameId?: string }): Promise<ReportRow[]>;
  /**
   * Moderators only, never on their own game (resolutions: REPORT_RESOLUTIONS in @gg/schemas). remove takes the game
   * down and strikes the owner; unlist takes it out of the feed until a new version is accepted; both close every open
   * report on it. warn strikes the owner (not on broken reports); license (ip reports) records the terms; dismiss does
   * nothing else. A suspended game comes back once fewer than three players still have open reports on it.
   */
  resolveReport(reportId: string, moderatorId: string, resolution: ResolveInput): Promise<{ report: ReportRow; game: GameRow }>;
  activeStrikes(userId: string): Promise<number>;
  isModerator(userId: string): Promise<boolean>;
  listTakedowns(gameId: string): Promise<TakedownRow[]>;
}
