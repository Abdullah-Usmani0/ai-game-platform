import type { AppealDecision, AppealInput, JamInput, JamSchedule, JamVote, ModelPolicy, PlayEvent, PlaySource, RatingTag, ReportInput, ReportKind, ReportResolution, ResolveInput, TestSubmission, TestVerdict, Trajectory } from '@gg/schemas';

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

/** A play event as stored: who, which play and version, what and where (see PlayEvent in @gg/schemas). */
export interface PlayEventRow extends PlayEvent {
  playId: string;
  gameId: string;
  versionId: string;
  userId: string;
}

/** Events of one kind in one cell; x and y are cell coordinates, floor(px / cell). */
export interface HeatCell {
  x: number;
  y: number;
  n: number;
}

/** One level's heat: how many plays reached it, and where players died, quit, and spent their time. */
export interface LevelHeat {
  plays: number;
  death: HeatCell[];
  quit: HeatCell[];
  sample: HeatCell[];
}

/** Where other players died, lingered and quit, per level of one version; the owner's own plays are left out. */
export interface Heatmap {
  versionId: string;
  cell: number;
  levels: Record<string, LevelHeat>;
}

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

/** The public audit trail of a removal or a licence settlement; revertedAt is set when an appeal restores the game. */
export interface TakedownRow {
  id: string;
  gameId: string;
  reportId: string;
  action: 'removed' | 'licensed';
  terms: string;
  moderatorId: string;
  createdAt: string;
  revertedAt: string | null;
}

/** An owner's appeal of a removal (a counter-notice for an ip takedown) and the moderators' decision. */
export interface AppealRow {
  id: string;
  takedownId: string;
  gameId: string;
  ownerId: string;
  statement: string;
  contactName: string;
  contactEmail: string;
  consent: boolean;
  status: 'open' | 'reinstated' | 'upheld';
  /** The earliest a reinstatement may happen: 14 days after a counter-notice, at once for other appeals. */
  reinstateAfter: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string;
}

export type JamPhase = 'upcoming' | 'open' | 'voting' | 'closed';

/** A jam: a theme and three moments (entries open, submissions close and voting starts, results are published). */
export interface JamRow {
  id: string;
  slug: string;
  title: string;
  theme: string;
  description: string;
  /** Genres entries may be in; empty means any. */
  genres: string[];
  startsAt: string;
  submissionsClose: string;
  votingClose: string;
  createdBy: string;
  createdAt: string;
}

/** A game in a jam, frozen at the version that was its head when it was entered. */
export interface JamEntryRow {
  jamId: string;
  gameId: string;
  ownerId: string;
  versionId: string;
  submittedAt: string;
}

export interface JamVoteRow {
  jamId: string;
  gameId: string;
  voterId: string;
  fun: number;
  theme: number;
  look: number;
  createdAt: string;
  updatedAt: string;
}

/** An entry once voting closed: raw means per criterion (null without votes), the score it ranks by, and its rank. */
export interface JamResult {
  gameId: string;
  versionId: string;
  ownerId: string;
  votes: number;
  fun: number | null;
  theme: number | null;
  look: number | null;
  score: number;
  /** null below JAM.minVotes. */
  rank: number | null;
}

/**
 * A verified (input -> artifact) pair from a model-written stage artifact, recorded once the stage's gate passed: the
 * raw data of the distillation flywheel (tools/distill exports it per stage as chat-format JSONL).
 */
export interface TrainingPairRow {
  id: string;
  /** The stage that wrote it (gdd, systems, behaviour, a structured stage), or 'route' for the edit router. */
  stage: string;
  genre: string | null;
  /** The schema it follows (an ArtifactName), or GddBody for the GDD's markdown body. */
  artifact: string;
  /** What the model was asked: the stage's system prompt and its first prompt (never a repair prompt). */
  input: { system: string; prompt: string };
  /** The artifact as it was written: JSON for a schema artifact, a string for a text one. */
  output: unknown;
  /** promptHash(system, prompt, artifact): exports keep one pair per input. */
  inputHash: string;
  model: string;
  provider: string;
  jobId: string | null;
  gameId: string | null;
  /** Everyone whose content the pair carries (the requester, the game's owner, the owners of games it was remixed from). */
  contributors: string[];
  /** The gate report that verified it. */
  verifiedBy: string | null;
  policyVersion: number | null;
  /** Set by the first export that included the pair. */
  exportedAt: string | null;
  createdAt: string;
}
export type NewTrainingPair = Omit<TrainingPairRow, 'id' | 'exportedAt' | 'createdAt'>;

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
  /** Records a finished session with its heatmap events (deaths, quit point, position samples; capped by PlayReport). */
  recordPlay(play: NewPlay, events?: readonly PlayEvent[]): Promise<PlayRow>;
  /** Per-level heatmap of one version (cell in pixels, usually the tile size). The caller checks the viewer owns the game. */
  playHeatmap(gameId: string, versionId: string, cell?: number): Promise<Heatmap>;
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
  getReport(reportId: string): Promise<ReportRow | null>;
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
  /**
   * The owner appeals the game's standing removal: once per takedown, a counter-notice (consent required) for an ip
   * takedown, which can be decided 14 days after it is filed, or a plain appeal decided at once.
   */
  appealTakedown(gameId: string, ownerId: string, input: AppealInput): Promise<AppealRow>;
  listAppeals(opts?: { status?: AppealRow['status']; gameId?: string }): Promise<AppealRow[]>;
  /**
   * Moderators only, never on their own game. reinstate puts back every game the takedown removed (the game and its
   * unedited remixes) as playable and unlisted, restores their quarantined bundles and voids the takedown's strikes;
   * uphold closes the appeal.
   */
  decideAppeal(appealId: string, moderatorId: string, decision: AppealDecision): Promise<{ appeal: AppealRow; games: GameRow[] }>;

  // ---- jams (phase 3) ----
  /** Moderators only; slugs are unique and the three moments in order. */
  createJam(moderatorId: string, input: JamInput): Promise<JamRow>;
  /** Latest start first. */
  listJams(): Promise<JamRow[]>;
  getJam(jamIdOrSlug: string): Promise<JamRow | null>;
  /** Moderators only: move a jam's moments (extend submissions, open voting or publish results early); order holds. */
  setJamSchedule(jamId: string, moderatorId: string, schedule: JamSchedule): Promise<JamRow>;
  /**
   * While submissions are open, the owner enters a listed, unmoderated game whose head passed its playtest, made after
   * the jam started (for a remix, its original too), in one of the jam's genres; one entry per owner. Entering the same
   * game again re-freezes its current head.
   */
  submitToJam(jamId: string, gameId: string, userId: string): Promise<JamEntryRow>;
  /** The owner, while submissions are open. */
  withdrawFromJam(jamId: string, gameId: string, userId: string): Promise<void>;
  /** Entries whose games are still listed and unmoderated, earliest first. */
  listJamEntries(jamId: string): Promise<JamEntryRow[]>;
  /**
   * While voting is open: 1-5 on fun, theme and look for an entry the voter did not make, once they played its entered
   * version for JAM.votePlayS seconds; voting again replaces the vote.
   */
  voteInJam(jamId: string, gameId: string, voterId: string, vote: JamVote): Promise<JamVoteRow>;
  listJamVotes(jamId: string, voterId: string): Promise<JamVoteRow[]>;
  /** Once voting closed: the entries still listed and unmoderated, ranked by rankJam (ranking.ts). */
  jamResults(jamId: string): Promise<JamResult[]>;

  // ---- distillation (phase 3) ----
  /** Records a verified pair; returns null (and stores nothing) when any contributor opted out of training. */
  insertTrainingPair(pair: NewTrainingPair): Promise<TrainingPairRow | null>;
  /** Oldest first. exported: true for pairs an export already included, false for the rest. */
  listTrainingPairs(opts?: { stage?: string; exported?: boolean; limit?: number }): Promise<TrainingPairRow[]>;
  /** Stamps the pairs an export included; pairs exported before keep their first date. Returns how many were stamped. */
  markTrainingPairsExported(ids: readonly string[], at?: string): Promise<number>;
  trainingOptOut(userId: string): Promise<boolean>;
  /** Opting out deletes every recorded pair the user contributed to, and no new ones are recorded. */
  setTrainingOptOut(userId: string, optOut: boolean): Promise<void>;
}
