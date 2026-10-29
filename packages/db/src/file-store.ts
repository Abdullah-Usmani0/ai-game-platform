import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ModelPolicy, PLAY_EVENT_LIMITS, type AppealDecision, type AppealInput, type JamInput, type JamSchedule, type JamVote, type PlayEvent, type RatingTag, type ReportInput, type ResolveInput, type TestSubmission, type Trajectory } from '@gg/schemas';
import { checkCell, HEAT_CELL, heatmapFrom, heatRows } from './heatmap';
import { computeStats, feedEligible, headPlaytestPassed, JAM, jamPhase, MODERATION, quarantinePath, RANKING, rankJam, testOutcome } from './ranking';
import type { AppealRow, CreditEntry, FeedItem, GameRow, GameStats, Heatmap, JamEntryRow, JamResult, JamRow, JamVoteRow, JobEvent, JobEventType, JobRow, LineageRow, NewGame, NewPlay, NewTrainingPair, NewVersion, PlayEventRow, PlayRow, RatingRow, ReportRow, Store, StrikeRow, TakedownRow, TestAssignmentRow, TestQueueRow, TrainingPairRow, VersionRow } from './types';

interface FileState {
  games: GameRow[];
  lineage: LineageRow[];
  jobs: JobRow[];
  events: JobEvent[];
  versions: VersionRow[];
  trajectories: Trajectory[];
  policies: ModelPolicy[];
  plays: PlayRow[];
  playEvents: PlayEventRow[];
  ratings: RatingRow[];
  testQueue: TestQueueRow[];
  testAssignments: TestAssignmentRow[];
  credits: CreditEntry[];
  reports: ReportRow[];
  strikes: StrikeRow[];
  takedowns: TakedownRow[];
  appeals: AppealRow[];
  /** Local moderators by user id (Supabase: profiles.is_moderator). */
  moderators: string[];
  trainingPairs: TrainingPairRow[];
  /** Users who opted out of training (Supabase: profiles.training_opt_out). */
  trainingOptOut: string[];
  jams: JamRow[];
  jamEntries: JamEntryRow[];
  jamVotes: JamVoteRow[];
}

/** How long a claimed test stays reserved for its tester. */
const TEST_CLAIM_MS = 30 * 60_000;

const DEFAULT_POLICY: ModelPolicy = ModelPolicy.parse({
  version: 1,
  name: 'local-dev',
  stages: {
    implement: { runner: 'claude-sdk', provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'medium', k: 1, repairRounds: 2, caps: { turns: 120, usd: 4, wallMin: 30 } },
    levels: { runner: 'claude-sdk', provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', k: 1, repairRounds: 2, caps: { turns: 60, usd: 1, wallMin: 15 } },
    behaviour: { runner: 'structured', provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'medium', k: 4, repairRounds: 2, caps: { turns: 0, usd: 0.5, wallMin: 5 } },
  },
  jobCaps: { softUsd: 10, hardUsd: 15, providerUsd: 3, wallMin: 90 },
});

/** The head a moderator unlisted (listing.unlisted.versionId), or null. */
function unlistedVersion(g: GameRow): string | null {
  const u = g.listing['unlisted'] as { versionId?: unknown } | undefined;
  return typeof u?.versionId === 'string' ? u.versionId : null;
}

/**
 * JSON-file store for local development, demos and evals. Not for production: every method re-reads the
 * file when it changed on disk and writes atomically, which is enough for one worker plus the dev web app.
 */
export class FileStore implements Store {
  private state: FileState;
  private readonly file: string;
  private mtime = 0;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'store.json');
    this.state = { games: [], lineage: [], jobs: [], events: [], versions: [], trajectories: [], policies: [DEFAULT_POLICY], plays: [], playEvents: [], ratings: [], testQueue: [], testAssignments: [], credits: [], reports: [], strikes: [], takedowns: [], appeals: [], moderators: ['moderator'], trainingPairs: [], trainingOptOut: [], jams: [], jamEntries: [], jamVotes: [] };
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    const m = statSync(this.file).mtimeMs;
    if (m === this.mtime) return;
    const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<FileState>;
    this.state = {
      games: parsed.games ?? [],
      lineage: parsed.lineage ?? [],
      jobs: parsed.jobs ?? [],
      events: parsed.events ?? [],
      versions: parsed.versions ?? [],
      trajectories: parsed.trajectories ?? [],
      policies: parsed.policies?.length ? parsed.policies : [DEFAULT_POLICY],
      plays: parsed.plays ?? [],
      playEvents: parsed.playEvents ?? [],
      ratings: parsed.ratings ?? [],
      testQueue: parsed.testQueue ?? [],
      testAssignments: parsed.testAssignments ?? [],
      credits: parsed.credits ?? [],
      reports: parsed.reports ?? [],
      strikes: parsed.strikes ?? [],
      takedowns: (parsed.takedowns ?? []).map((t) => ({ ...t, revertedAt: t.revertedAt ?? null })),
      appeals: parsed.appeals ?? [],
      moderators: parsed.moderators ?? ['moderator'],
      trainingPairs: parsed.trainingPairs ?? [],
      trainingOptOut: parsed.trainingOptOut ?? [],
      jams: parsed.jams ?? [],
      jamEntries: parsed.jamEntries ?? [],
      jamVotes: parsed.jamVotes ?? [],
    };
    this.mtime = m;
  }

  private save(): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
    this.mtime = statSync(this.file).mtimeMs;
  }

  async claimJob(workerId: string): Promise<JobRow | null> {
    this.load();
    const job = this.state.jobs.filter((j) => j.status === 'queued').sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];
    if (!job) return null;
    job.status = 'running';
    job.workerId = workerId;
    job.startedAt = new Date().toISOString();
    job.attempts++;
    this.save();
    return { ...job };
  }

  async getJob(jobId: string): Promise<JobRow | null> {
    this.load();
    const j = this.state.jobs.find((x) => x.id === jobId);
    return j ? { ...j } : null;
  }

  async enqueueJob(input: Parameters<Store['enqueueJob']>[0]): Promise<JobRow> {
    this.load();
    const job: JobRow = {
      id: randomUUID(),
      gameId: input.gameId,
      userId: input.userId,
      kind: input.kind,
      status: 'queued',
      stage: null,
      stages: {},
      input: input.input ?? {},
      baseVersionId: input.baseVersionId ?? null,
      resultVersionId: null,
      policyVersion: input.policyVersion ?? 1,
      budgetUsdCap: input.budgetUsdCap ?? 15,
      costUsd: 0,
      providerCostUsd: 0,
      turns: 0,
      priority: input.priority ?? 0,
      workerId: null,
      attempts: 0,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    };
    this.state.jobs.push(job);
    this.save();
    return { ...job };
  }

  async updateJob(jobId: string, patch: Partial<Omit<JobRow, 'id'>>): Promise<void> {
    this.load();
    const j = this.state.jobs.find((x) => x.id === jobId);
    if (!j) throw new Error(`job ${jobId} not found`);
    Object.assign(j, patch);
    this.save();
  }

  async appendEvent(jobId: string, type: JobEventType, payload: Record<string, unknown> = {}, stage: string | null = null): Promise<JobEvent> {
    this.load();
    const seq = this.state.events.filter((e) => e.jobId === jobId).length + 1;
    const ev: JobEvent = { jobId, seq, ts: new Date().toISOString(), stage, type, payload };
    this.state.events.push(ev);
    this.save();
    return ev;
  }

  async listEvents(jobId: string): Promise<JobEvent[]> {
    this.load();
    return this.state.events.filter((e) => e.jobId === jobId).map((e) => ({ ...e }));
  }

  async insertVersion(v: NewVersion): Promise<VersionRow> {
    this.load();
    const number = this.state.versions.filter((x) => x.gameId === v.gameId).length + 1;
    const row: VersionRow = { ...v, id: v.id ?? randomUUID(), number, isHead: false, createdAt: new Date().toISOString() };
    this.state.versions.push(row);
    this.save();
    return { ...row };
  }

  async acceptVersion(versionId: string): Promise<void> {
    this.load();
    const v = this.state.versions.find((x) => x.id === versionId);
    if (!v) throw new Error(`version ${versionId} not found`);
    for (const x of this.state.versions) if (x.gameId === v.gameId) x.isHead = false;
    v.isHead = true;
    v.kind = 'accepted';
    const g = this.state.games.find((x) => x.id === v.gameId);
    if (g) {
      g.headVersionId = v.id;
      // A new version neither lifts moderation nor unpublishes a listed game.
      if (g.state !== 'removed' && g.state !== 'suspended' && g.state !== 'published') g.state = 'playable';
      g.updatedAt = new Date().toISOString();
    }
    this.save();
  }

  async insertTrajectory(t: Trajectory): Promise<void> {
    this.load();
    this.state.trajectories.push(t);
    this.save();
  }

  async listTrajectories(jobId: string): Promise<Trajectory[]> {
    this.load();
    return this.state.trajectories.filter((t) => t.jobId === jobId);
  }

  async activePolicy(): Promise<ModelPolicy> {
    this.load();
    const p = this.state.policies[this.state.policies.length - 1];
    if (!p) throw new Error('no policy');
    return p;
  }

  async putObject(bucket: string, path: string, bytes: Uint8Array, _contentType: string): Promise<string> {
    const full = join(this.dir, 'buckets', bucket, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
    return `${bucket}/${path}`;
  }

  async getObject(bucket: string, path: string): Promise<Uint8Array> {
    return new Uint8Array(readFileSync(join(this.dir, 'buckets', bucket, path)));
  }

  /** Absolute path of a stored object (the dev web app serves bundles straight from here). */
  objectPath(bucket: string, path: string): string {
    return join(this.dir, 'buckets', bucket, path);
  }

  async createGame(g: NewGame): Promise<GameRow> {
    this.load();
    if (this.state.games.some((x) => x.slug === g.slug)) throw new Error(`slug '${g.slug}' is taken`);
    const now = new Date().toISOString();
    const row: GameRow = {
      id: g.id ?? randomUUID(),
      ownerId: g.ownerId,
      slug: g.slug,
      title: g.title,
      genre: g.genre,
      visibility: g.visibility ?? 'private',
      state: g.state ?? 'draft',
      headVersionId: null,
      conceptMd: g.conceptMd ?? null,
      concept: g.concept ?? null,
      listing: g.listing ?? {},
      originVersionId: null,
      rootGameId: null,
      remixDepth: 0,
      stats: {},
      createdAt: now,
      updatedAt: now,
    };
    this.state.games.push(row);
    this.save();
    return { ...row };
  }

  async getGame(gameId: string): Promise<GameRow | null> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    return g ? { ...g } : null;
  }

  async getGameBySlug(slug: string): Promise<GameRow | null> {
    this.load();
    const g = this.state.games.find((x) => x.slug === slug);
    return g ? { ...g } : null;
  }

  async listGames(opts: { ownerId?: string; limit?: number } = {}): Promise<GameRow[]> {
    this.load();
    return this.state.games
      .filter((g) => !opts.ownerId || g.ownerId === opts.ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, opts.limit ?? 50)
      .map((g) => ({ ...g }));
  }

  async updateGame(gameId: string, patch: Partial<Omit<GameRow, 'id'>>): Promise<void> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g) throw new Error(`game ${gameId} not found`);
    Object.assign(g, patch, { updatedAt: new Date().toISOString() });
    this.save();
  }

  async getVersion(versionId: string): Promise<VersionRow | null> {
    this.load();
    const v = this.state.versions.find((x) => x.id === versionId);
    return v ? { ...v } : null;
  }

  async listVersions(gameId: string): Promise<VersionRow[]> {
    this.load();
    return this.state.versions.filter((v) => v.gameId === gameId).map((v) => ({ ...v }));
  }

  async listJobs(gameId: string): Promise<JobRow[]> {
    this.load();
    return this.state.jobs.filter((j) => j.gameId === gameId).map((j) => ({ ...j }));
  }

  async forkGame(originVersionId: string, opts: { ownerId: string; slug: string; title: string }): Promise<GameRow> {
    this.load();
    const origin = this.state.versions.find((v) => v.id === originVersionId);
    if (!origin) throw new Error(`origin version ${originVersionId} not found`);
    const src = this.state.games.find((g) => g.id === origin.gameId);
    if (!src) throw new Error(`origin game ${origin.gameId} not found`);
    if (src.state === 'removed' || src.state === 'suspended') throw new Error(`the game is ${src.state}; it cannot be remixed`);
    const game = await this.createGame({ ownerId: opts.ownerId, slug: opts.slug, title: opts.title, genre: src.genre, conceptMd: src.conceptMd ?? undefined, concept: src.concept ?? undefined, state: 'draft' });
    this.load();
    const row = this.state.games.find((g) => g.id === game.id)!;
    row.originVersionId = origin.id;
    row.rootGameId = src.rootGameId ?? src.id;
    row.remixDepth = src.remixDepth + 1;
    for (const l of this.state.lineage.filter((l) => l.gameId === src.id)) this.state.lineage.push({ gameId: game.id, ancestorGameId: l.ancestorGameId, depth: l.depth + 1, forkedFromVersionId: origin.id });
    this.state.lineage.push({ gameId: game.id, ancestorGameId: src.id, depth: 1, forkedFromVersionId: origin.id });
    this.save();
    const copy = await this.insertVersion({ gameId: game.id, kind: 'accepted', stage: 'remix', parentVersionId: origin.id, jobId: null, sourcePath: origin.sourcePath, bundlePath: origin.bundlePath, manifest: origin.manifest, design: origin.design, gateResults: origin.gateResults, evidence: { ...origin.evidence, remixedFrom: origin.id }, engineVersion: origin.engineVersion, contentHash: origin.contentHash, costUsd: 0, policyVersion: origin.policyVersion });
    await this.acceptVersion(copy.id);
    return (await this.getGame(game.id))!;
  }

  async listLineage(gameId: string): Promise<LineageRow[]> {
    this.load();
    return this.state.lineage.filter((l) => l.gameId === gameId).map((l) => ({ ...l }));
  }

  // ---------------------------------------------------------------- community

  async recordPlay(play: NewPlay, events: readonly PlayEvent[] = []): Promise<PlayRow> {
    this.load();
    if (!this.state.games.some((g) => g.id === play.gameId)) throw new Error(`game ${play.gameId} not found`);
    if (events.length > PLAY_EVENT_LIMITS.total) throw new Error(`a play carries at most ${PLAY_EVENT_LIMITS.total} events`);
    const row: PlayRow = { ...play, id: randomUUID(), createdAt: new Date().toISOString() };
    this.state.plays.push(row);
    for (const e of events) this.state.playEvents.push({ kind: e.kind, level: e.level, x: e.x, y: e.y, t: e.t, playId: row.id, gameId: row.gameId, versionId: row.versionId, userId: row.userId });
    this.save();
    return { ...row };
  }

  async playHeatmap(gameId: string, versionId: string, cell: number = HEAT_CELL.default): Promise<Heatmap> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g) throw new Error(`game ${gameId} not found`);
    checkCell(cell);
    const events = this.state.playEvents.filter((e) => e.gameId === gameId);
    return heatmapFrom(heatRows(events, { versionId, ownerId: g.ownerId, cell }), versionId, cell);
  }

  async rateGame(gameId: string, userId: string, rating: { tag: RatingTag; score?: number }): Promise<RatingRow> {
    this.load();
    if (!this.state.games.some((g) => g.id === gameId)) throw new Error(`game ${gameId} not found`);
    const now = new Date().toISOString();
    let row = this.state.ratings.find((r) => r.gameId === gameId && r.userId === userId);
    if (row) Object.assign(row, { tag: rating.tag, score: rating.score ?? null, updatedAt: now });
    else {
      row = { gameId, userId, tag: rating.tag, score: rating.score ?? null, createdAt: now, updatedAt: now };
      this.state.ratings.push(row);
    }
    this.save();
    return { ...row };
  }

  async getRating(gameId: string, userId: string): Promise<RatingRow | null> {
    this.load();
    const r = this.state.ratings.find((x) => x.gameId === gameId && x.userId === userId);
    return r ? { ...r } : null;
  }

  private statsFor(game: GameRow, now = new Date()): GameStats {
    const closed = this.state.testQueue.filter((q) => q.gameId === game.id && q.status === 'closed').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
    return computeStats({
      game,
      plays: this.state.plays.filter((p) => p.gameId === game.id),
      ratings: this.state.ratings.filter((r) => r.gameId === game.id),
      remixes: this.state.lineage.filter((l) => l.ancestorGameId === game.id).length,
      testOutcome: closed[0]?.outcome ?? null,
      now,
    });
  }

  async gameStats(gameId: string): Promise<GameStats> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g) throw new Error(`game ${gameId} not found`);
    return this.statsFor(g);
  }

  async listFeed(opts: { limit?: number } = {}): Promise<FeedItem[]> {
    this.load();
    const now = new Date();
    const items: FeedItem[] = [];
    for (const game of this.state.games) {
      if (game.visibility !== 'listed') continue;
      const head = this.state.versions.find((v) => v.id === game.headVersionId) ?? null;
      const stats = this.statsFor(game, now);
      if (head && feedEligible(game, head, stats)) items.push({ game: { ...game }, head: { ...head }, stats });
    }
    return items.sort((a, b) => b.stats.rankScore - a.stats.rankScore || b.game.createdAt.localeCompare(a.game.createdAt)).slice(0, opts.limit ?? 50);
  }

  async setListed(gameId: string, listed: boolean): Promise<GameRow> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g) throw new Error(`game ${gameId} not found`);
    if (listed) {
      if (g.state === 'removed' || g.state === 'suspended') throw new Error(`the game is ${g.state}; it cannot be listed until moderation clears it`);
      if (this.strikesOf(g.ownerId) >= MODERATION.maxStrikes) throw new Error(`listing is blocked while the owner has ${MODERATION.maxStrikes} active strikes`);
      if (g.headVersionId && unlistedVersion(g) === g.headVersionId) throw new Error('a moderator unlisted this version; publish a fixed version first');
      const head = this.state.versions.find((v) => v.id === g.headVersionId) ?? null;
      if (!head || !headPlaytestPassed(head)) throw new Error('the game needs an accepted version whose playtest passed before it can be listed');
      const last = this.state.testQueue.filter((q) => q.gameId === g.id && q.versionId === head.id && q.status === 'closed').pop();
      if (last?.outcome === 'broken') throw new Error('testers reported this version broken; publish a fixed version first');
    }
    Object.assign(g, { visibility: listed ? 'listed' : 'unlisted', state: listed ? 'published' : g.state === 'published' ? 'playable' : g.state, updatedAt: new Date().toISOString() });
    this.save();
    return { ...g };
  }

  async enqueueTest(input: { gameId: string; versionId: string; requestedBy: string; needed?: number; rewardCredits?: number }): Promise<TestQueueRow> {
    this.load();
    const g = this.state.games.find((x) => x.id === input.gameId);
    if (!g) throw new Error(`game ${input.gameId} not found`);
    if (g.state === 'removed' || g.state === 'suspended') throw new Error(`the game is ${g.state}; testers cannot be asked until moderation clears it`);
    const v = this.state.versions.find((x) => x.id === input.versionId && x.gameId === g.id);
    if (!v?.bundlePath) throw new Error(`version ${input.versionId} has no published bundle`);
    const open = this.state.testQueue.find((q) => q.gameId === g.id && q.versionId === v.id && q.status === 'open');
    if (open) return { ...open };
    const row: TestQueueRow = { id: randomUUID(), gameId: g.id, versionId: v.id, requestedBy: input.requestedBy, needed: input.needed ?? 3, rewardCredits: input.rewardCredits ?? 5, status: 'open', outcome: null, createdAt: new Date().toISOString(), closedAt: null };
    this.state.testQueue.push(row);
    this.save();
    return { ...row };
  }

  async listTests(gameId: string): Promise<{ queue: TestQueueRow[]; assignments: TestAssignmentRow[] }> {
    this.load();
    return {
      queue: this.state.testQueue.filter((q) => q.gameId === gameId).map((q) => ({ ...q })),
      assignments: this.state.testAssignments.filter((a) => a.gameId === gameId).map((a) => ({ ...a })),
    };
  }

  async claimTest(testerId: string): Promise<{ assignment: TestAssignmentRow; queue: TestQueueRow } | null> {
    this.load();
    const now = Date.now();
    const live = (a: TestAssignmentRow) => a.submittedAt === null && Date.parse(a.expiresAt) > now;
    const mine = this.state.testAssignments.find((a) => a.testerId === testerId && live(a));
    if (mine) {
      const q = this.state.testQueue.find((x) => x.id === mine.queueId)!;
      return { assignment: { ...mine }, queue: { ...q } };
    }
    const candidates = this.state.testQueue
      .filter((q) => q.status === 'open')
      .filter((q) => {
        const g = this.state.games.find((x) => x.id === q.gameId);
        return g !== undefined && g.ownerId !== testerId && g.state !== 'removed' && g.state !== 'suspended';
      })
      .filter((q) => !this.state.testAssignments.some((a) => a.queueId === q.id && a.testerId === testerId))
      .filter((q) => this.state.testAssignments.filter((a) => a.queueId === q.id && (a.submittedAt !== null || live(a))).length < q.needed)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const q = candidates[0];
    if (!q) return null;
    const assignment: TestAssignmentRow = { id: randomUUID(), queueId: q.id, gameId: q.gameId, versionId: q.versionId, testerId, claimedAt: new Date(now).toISOString(), expiresAt: new Date(now + TEST_CLAIM_MS).toISOString(), submittedAt: null, verdict: null, tag: null, note: '', rewardPaid: 0 };
    this.state.testAssignments.push(assignment);
    this.save();
    return { assignment: { ...assignment }, queue: { ...q } };
  }

  async submitTest(assignmentId: string, testerId: string, report: TestSubmission): Promise<{ assignment: TestAssignmentRow; queue: TestQueueRow }> {
    this.load();
    const a = this.state.testAssignments.find((x) => x.id === assignmentId);
    if (!a || a.testerId !== testerId) throw new Error('assignment not found');
    if (a.submittedAt !== null) throw new Error('this test was already submitted');
    if (Date.parse(a.expiresAt) <= Date.now()) throw new Error('this test claim expired; claim again');
    const played = this.state.plays.some((p) => p.gameId === a.gameId && p.versionId === a.versionId && p.userId === testerId && p.source === 'test' && p.durationS >= RANKING.qualifiedPlayS && p.createdAt >= a.claimedAt);
    if (!played) throw new Error(`play the game for at least ${RANKING.qualifiedPlayS} s before reporting`);
    const q = this.state.testQueue.find((x) => x.id === a.queueId)!;
    Object.assign(a, { submittedAt: new Date().toISOString(), verdict: report.verdict, tag: report.tag, note: report.note, rewardPaid: q.rewardCredits });
    if (q.rewardCredits > 0) {
      const balance = this.balance(testerId) + q.rewardCredits;
      this.state.credits.push({ userId: testerId, delta: q.rewardCredits, reason: 'test_reward', refId: a.id, balanceAfter: balance, createdAt: new Date().toISOString() });
    }
    const done = this.state.testAssignments.filter((x) => x.queueId === q.id && x.submittedAt !== null);
    if (done.length >= q.needed && q.status === 'open') {
      q.status = 'closed';
      q.closedAt = new Date().toISOString();
      q.outcome = testOutcome(done.map((x) => x.verdict!));
      const g = this.state.games.find((x) => x.id === q.gameId);
      if (g) g.listing = { ...g.listing, tested: { versionId: q.versionId, outcome: q.outcome, at: q.closedAt } };
    }
    this.save();
    return { assignment: { ...a }, queue: { ...q } };
  }

  private balance(userId: string): number {
    const entries = this.state.credits.filter((c) => c.userId === userId);
    return entries.length ? entries[entries.length - 1]!.balanceAfter : 0;
  }

  async creditBalance(userId: string): Promise<number> {
    this.load();
    return this.balance(userId);
  }

  // ---------------------------------------------------------------- moderation

  private strikesOf(userId: string, now = Date.now()): number {
    return this.state.strikes.filter((x) => x.userId === userId && Date.parse(x.expiresAt) > now).length;
  }

  /** Distinct players with open reports of the suspending kinds on a game. */
  private suspendingReporters(gameId: string): number {
    return new Set(this.state.reports.filter((r) => r.gameId === gameId && r.status === 'open' && MODERATION.suspendKinds.includes(r.kind)).map((r) => r.reporterId)).size;
  }

  async reportGame(gameId: string, reporterId: string, report: ReportInput): Promise<{ report: ReportRow; suspended: boolean }> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g) throw new Error(`game ${gameId} not found`);
    if (g.ownerId === reporterId) throw new Error('you cannot report your own game');
    if (g.state === 'removed') throw new Error('this game was already removed');
    let row = this.state.reports.find((r) => r.gameId === gameId && r.reporterId === reporterId && r.kind === report.kind && r.status === 'open');
    if (row) Object.assign(row, { note: report.note, rightsHolder: report.rightsHolder });
    else {
      row = { id: randomUUID(), gameId, versionId: g.headVersionId, reporterId, kind: report.kind, note: report.note, rightsHolder: report.rightsHolder, status: 'open', resolution: null, resolvedBy: null, resolutionNote: '', createdAt: new Date().toISOString(), resolvedAt: null };
      this.state.reports.push(row);
    }
    let suspended = false;
    if (g.state !== 'suspended' && this.suspendingReporters(gameId) >= MODERATION.suspendReporters) {
      g.state = 'suspended';
      g.updatedAt = new Date().toISOString();
      suspended = true;
    }
    this.save();
    return { report: { ...row }, suspended };
  }

  async listReports(opts: { status?: 'open' | 'resolved'; gameId?: string } = {}): Promise<ReportRow[]> {
    this.load();
    return this.state.reports.filter((r) => (!opts.status || r.status === opts.status) && (!opts.gameId || r.gameId === opts.gameId)).map((r) => ({ ...r }));
  }

  async getReport(reportId: string): Promise<ReportRow | null> {
    this.load();
    const r = this.state.reports.find((x) => x.id === reportId);
    return r ? { ...r } : null;
  }

  async resolveReport(reportId: string, moderatorId: string, input: ResolveInput): Promise<{ report: ReportRow; game: GameRow }> {
    this.load();
    if (!this.state.moderators.includes(moderatorId)) throw new Error('only moderators can resolve reports');
    const r = this.state.reports.find((x) => x.id === reportId);
    if (!r) throw new Error('report not found');
    if (r.status !== 'open') throw new Error('this report is already resolved');
    const g = this.state.games.find((x) => x.id === r.gameId);
    if (!g) throw new Error(`game ${r.gameId} not found`);
    if (g.ownerId === moderatorId) throw new Error('moderators cannot resolve reports on their own games');
    if (input.resolution === 'license' && r.kind !== 'ip') throw new Error('only ip reports can be settled by licence');
    if (input.resolution === 'warn' && r.kind === 'broken') throw new Error('a broken game is not misconduct: unlist it until it is fixed, or dismiss the report');
    const now = new Date();
    const close = (x: ReportRow) => Object.assign(x, { status: 'resolved', resolution: input.resolution, resolvedBy: moderatorId, resolutionNote: input.note, resolvedAt: now.toISOString() });
    close(r);
    // Unedited remixes serve the removed game's bundle: they come down with it, without a strike for their owners.
    const prefix = `bundles/g/${g.id}/`;
    const copies = input.resolution !== 'remove' ? [] : this.state.games.filter((c) => c.id !== g.id && c.state !== 'removed' && this.state.versions.find((v) => v.id === c.headVersionId)?.bundlePath?.startsWith(prefix));
    if (input.resolution === 'remove' || input.resolution === 'warn') {
      this.state.strikes.push({ id: randomUUID(), userId: g.ownerId, reportId: r.id, gameId: g.id, reason: `${r.kind}: ${input.resolution}`, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + MODERATION.strikeDays * 86_400_000).toISOString() });
    }
    if (input.resolution === 'remove' || input.resolution === 'unlist') {
      const closing = new Set([g.id, ...copies.map((c) => c.id)]);
      for (const other of this.state.reports.filter((x) => closing.has(x.gameId) && x.status === 'open')) close(other);
    }
    if (input.resolution === 'remove') {
      for (const c of [g, ...copies]) {
        Object.assign(c, { state: 'removed', visibility: 'unlisted', updatedAt: now.toISOString() });
        this.state.takedowns.push({ id: randomUUID(), gameId: c.id, reportId: r.id, action: 'removed', terms: input.note, moderatorId, createdAt: now.toISOString(), revertedAt: null });
      }
      // Its own bundles leave the public bucket for a private quarantine, as in the Supabase store: an appeal that
      // reinstates the game moves them back, byte for byte.
      this.moveObjects('bundles', `g/${g.id}`, 'checkpoints', quarantinePath(r.id, g.id));
    } else if (input.resolution === 'unlist') {
      Object.assign(g, { state: g.state === 'published' || g.state === 'suspended' ? 'playable' : g.state, visibility: 'unlisted' });
      g.listing = { ...g.listing, unlisted: { versionId: g.headVersionId, reportId: r.id, note: input.note, at: now.toISOString() } };
    } else if (input.resolution === 'license') {
      g.listing = { ...g.listing, license: { terms: input.note, reportId: r.id, at: now.toISOString() } };
      this.state.takedowns.push({ id: randomUUID(), gameId: g.id, reportId: r.id, action: 'licensed', terms: input.note, moderatorId, createdAt: now.toISOString(), revertedAt: null });
    }
    if (g.state === 'suspended' && this.suspendingReporters(g.id) < MODERATION.suspendReporters) g.state = g.visibility === 'listed' ? 'published' : 'playable';
    g.updatedAt = now.toISOString();
    this.save();
    return { report: { ...r }, game: { ...g } };
  }

  async activeStrikes(userId: string): Promise<number> {
    this.load();
    return this.strikesOf(userId);
  }

  async isModerator(userId: string): Promise<boolean> {
    this.load();
    return this.state.moderators.includes(userId);
  }

  async listTakedowns(gameId: string): Promise<TakedownRow[]> {
    this.load();
    return this.state.takedowns.filter((t) => t.gameId === gameId).map((t) => ({ ...t }));
  }

  /** Moves a folder of objects between buckets (a missing folder is nothing to move). */
  private moveObjects(fromBucket: string, from: string, toBucket: string, to: string): void {
    const src = this.objectPath(fromBucket, from);
    if (!existsSync(src)) return;
    const dest = this.objectPath(toBucket, to);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(src, dest);
  }

  async appealTakedown(gameId: string, ownerId: string, input: AppealInput): Promise<AppealRow> {
    this.load();
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g || g.ownerId !== ownerId) throw new Error(`game ${gameId} not found`);
    if (g.state !== 'removed') throw new Error('only a removed game can be appealed');
    const takedown = this.state.takedowns.filter((t) => t.gameId === gameId && t.action === 'removed' && !t.revertedAt).pop();
    if (!takedown) throw new Error('no standing takedown to appeal');
    if (this.state.appeals.some((a) => a.takedownId === takedown.id)) throw new Error('this takedown was already appealed');
    const kind = this.state.reports.find((r) => r.id === takedown.reportId)?.kind;
    if (kind === 'ip' && !input.consent) throw new Error('a counter-notice needs your consent to the jurisdiction of the courts and to accept service from the claimant');
    const now = new Date();
    const wait = kind === 'ip' ? MODERATION.counterNoticeDays * 86_400_000 : 0;
    const row: AppealRow = { id: randomUUID(), takedownId: takedown.id, gameId, ownerId, statement: input.statement, contactName: input.name, contactEmail: input.email, consent: input.consent, status: 'open', reinstateAfter: new Date(now.getTime() + wait).toISOString(), createdAt: now.toISOString(), decidedAt: null, decidedBy: null, decisionNote: '' };
    this.state.appeals.push(row);
    this.save();
    return { ...row };
  }

  async listAppeals(opts: { status?: AppealRow['status']; gameId?: string } = {}): Promise<AppealRow[]> {
    this.load();
    return this.state.appeals.filter((a) => (!opts.status || a.status === opts.status) && (!opts.gameId || a.gameId === opts.gameId)).map((a) => ({ ...a }));
  }

  async decideAppeal(appealId: string, moderatorId: string, input: AppealDecision): Promise<{ appeal: AppealRow; games: GameRow[] }> {
    this.load();
    if (!this.state.moderators.includes(moderatorId)) throw new Error('only moderators can decide appeals');
    const a = this.state.appeals.find((x) => x.id === appealId);
    if (!a) throw new Error('appeal not found');
    if (a.status !== 'open') throw new Error('this appeal is already decided');
    if (a.ownerId === moderatorId) throw new Error('moderators cannot decide appeals on their own games');
    const now = new Date();
    const games: GameRow[] = [];
    if (input.decision === 'reinstate') {
      if (now.getTime() < Date.parse(a.reinstateAfter)) throw new Error(`a counter-notice waits ${MODERATION.counterNoticeDays} days for the claimant to go to court; the game can be restored from ${a.reinstateAfter}`);
      const takedown = this.state.takedowns.find((t) => t.id === a.takedownId)!;
      // Everything this report took down comes back: the game and the unedited remixes removed with it.
      for (const t of this.state.takedowns.filter((x) => x.reportId === takedown.reportId && x.action === 'removed' && !x.revertedAt)) {
        t.revertedAt = now.toISOString();
        const g = this.state.games.find((x) => x.id === t.gameId);
        if (g?.state === 'removed') {
          Object.assign(g, { state: 'playable', visibility: 'unlisted', updatedAt: now.toISOString() });
          this.moveObjects('checkpoints', quarantinePath(takedown.reportId, g.id), 'bundles', `g/${g.id}`);
          games.push({ ...g });
        }
      }
      this.state.strikes = this.state.strikes.filter((x) => x.reportId !== takedown.reportId);
    }
    Object.assign(a, { status: input.decision === 'reinstate' ? 'reinstated' : 'upheld', decidedAt: now.toISOString(), decidedBy: moderatorId, decisionNote: input.note });
    this.save();
    return { appeal: { ...a }, games };
  }

  async insertTrainingPair(pair: NewTrainingPair): Promise<TrainingPairRow | null> {
    this.load();
    const contributors = [...new Set(pair.contributors)];
    if (contributors.some((u) => this.state.trainingOptOut.includes(u))) return null;
    const row: TrainingPairRow = { ...pair, contributors, id: randomUUID(), exportedAt: null, createdAt: new Date().toISOString() };
    this.state.trainingPairs.push(row);
    this.save();
    return structuredClone(row);
  }

  async listTrainingPairs(opts: { stage?: string; exported?: boolean; limit?: number } = {}): Promise<TrainingPairRow[]> {
    this.load();
    return this.state.trainingPairs
      .filter((p) => (!opts.stage || p.stage === opts.stage) && (opts.exported === undefined || (p.exportedAt !== null) === opts.exported))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts.limit ?? Infinity)
      .map((p) => structuredClone(p));
  }

  async markTrainingPairsExported(ids: readonly string[], at = new Date().toISOString()): Promise<number> {
    this.load();
    const wanted = new Set(ids);
    let n = 0;
    for (const p of this.state.trainingPairs) {
      if (wanted.has(p.id) && p.exportedAt === null) {
        p.exportedAt = at;
        n++;
      }
    }
    if (n > 0) this.save();
    return n;
  }

  async trainingOptOut(userId: string): Promise<boolean> {
    this.load();
    return this.state.trainingOptOut.includes(userId);
  }

  async setTrainingOptOut(userId: string, optOut: boolean): Promise<void> {
    this.load();
    this.state.trainingOptOut = this.state.trainingOptOut.filter((u) => u !== userId);
    if (optOut) {
      this.state.trainingOptOut.push(userId);
      this.state.trainingPairs = this.state.trainingPairs.filter((p) => !p.contributors.includes(userId));
    }
    this.save();
  }

  // ---------------------------------------------------------------- jams

  private jam(jamIdOrSlug: string): JamRow {
    const j = this.state.jams.find((x) => x.id === jamIdOrSlug || x.slug === jamIdOrSlug);
    if (!j) throw new Error('jam not found');
    return j;
  }

  /** Still in the jam: the entry's game is listed and neither suspended nor removed. */
  private entryStands(e: JamEntryRow): boolean {
    const g = this.state.games.find((x) => x.id === e.gameId);
    return Boolean(g && g.visibility === 'listed' && (g.state === 'playable' || g.state === 'published'));
  }

  async createJam(moderatorId: string, input: JamInput): Promise<JamRow> {
    this.load();
    if (!this.state.moderators.includes(moderatorId)) throw new Error('only moderators can create jams');
    const [startsAt, submissionsClose, votingClose] = [input.startsAt, input.submissionsClose, input.votingClose].map((t) => new Date(t).toISOString()) as [string, string, string];
    if (!(startsAt < submissionsClose && submissionsClose < votingClose)) throw new Error('the jam must start, close submissions and close voting in that order');
    if (this.state.jams.some((j) => j.slug === input.slug)) throw new Error(`a jam called '${input.slug}' exists`);
    const row: JamRow = { id: randomUUID(), slug: input.slug, title: input.title, theme: input.theme, description: input.description, genres: [...input.genres], startsAt, submissionsClose, votingClose, createdBy: moderatorId, createdAt: new Date().toISOString() };
    this.state.jams.push(row);
    this.save();
    return structuredClone(row);
  }

  async listJams(): Promise<JamRow[]> {
    this.load();
    return [...this.state.jams].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((j) => structuredClone(j));
  }

  async getJam(jamIdOrSlug: string): Promise<JamRow | null> {
    this.load();
    const j = this.state.jams.find((x) => x.id === jamIdOrSlug || x.slug === jamIdOrSlug);
    return j ? structuredClone(j) : null;
  }

  async setJamSchedule(jamId: string, moderatorId: string, schedule: JamSchedule): Promise<JamRow> {
    this.load();
    if (!this.state.moderators.includes(moderatorId)) throw new Error('only moderators can change a jam');
    const j = this.jam(jamId);
    const next = { startsAt: j.startsAt, submissionsClose: j.submissionsClose, votingClose: j.votingClose };
    for (const k of ['startsAt', 'submissionsClose', 'votingClose'] as const) if (schedule[k]) next[k] = new Date(schedule[k]).toISOString();
    if (!(next.startsAt < next.submissionsClose && next.submissionsClose < next.votingClose)) throw new Error('the jam must start, close submissions and close voting in that order');
    Object.assign(j, next);
    this.save();
    return structuredClone(j);
  }

  async submitToJam(jamId: string, gameId: string, userId: string): Promise<JamEntryRow> {
    this.load();
    const j = this.jam(jamId);
    const phase = jamPhase(j);
    if (phase !== 'open') throw new Error(phase === 'upcoming' ? 'the jam has not started' : 'submissions are closed');
    const g = this.state.games.find((x) => x.id === gameId);
    if (!g || g.ownerId !== userId) throw new Error('game not found');
    if (g.state === 'removed' || g.state === 'suspended') throw new Error(`the game is ${g.state}; it cannot be entered`);
    const head = g.headVersionId ? (this.state.versions.find((v) => v.id === g.headVersionId) ?? null) : null;
    if (g.visibility !== 'listed' || !head || !headPlaytestPassed(head)) throw new Error('publish the game to the feed (a version whose playtest passed) before entering it');
    if (j.genres.length && !j.genres.includes(g.genre)) throw new Error(`this jam takes ${j.genres.join(', ')} games`);
    const root = g.rootGameId ? this.state.games.find((x) => x.id === g.rootGameId) : null;
    if (g.createdAt < j.startsAt || (root && root.createdAt < j.startsAt)) throw new Error('only games made after the jam started can be entered (for a remix, its original too)');
    const mine = this.state.jamEntries.find((e) => e.jamId === j.id && e.ownerId === userId);
    if (mine && mine.gameId !== gameId) throw new Error('you already entered another game in this jam; withdraw it first');
    if (mine) mine.versionId = head.id;
    else this.state.jamEntries.push({ jamId: j.id, gameId, ownerId: userId, versionId: head.id, submittedAt: new Date().toISOString() });
    this.save();
    return { ...this.state.jamEntries.find((e) => e.jamId === j.id && e.gameId === gameId)! };
  }

  async withdrawFromJam(jamId: string, gameId: string, userId: string): Promise<void> {
    this.load();
    const j = this.jam(jamId);
    if (jamPhase(j) !== 'open') throw new Error('entries can be withdrawn only while submissions are open');
    const e = this.state.jamEntries.find((x) => x.jamId === j.id && x.gameId === gameId);
    if (!e || e.ownerId !== userId) throw new Error('not your entry');
    this.state.jamEntries = this.state.jamEntries.filter((x) => x !== e);
    this.save();
  }

  async listJamEntries(jamId: string): Promise<JamEntryRow[]> {
    this.load();
    const j = this.jam(jamId);
    return this.state.jamEntries.filter((e) => e.jamId === j.id && this.entryStands(e)).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).map((e) => ({ ...e }));
  }

  async voteInJam(jamId: string, gameId: string, voterId: string, vote: JamVote): Promise<JamVoteRow> {
    this.load();
    const j = this.jam(jamId);
    const phase = jamPhase(j);
    if (phase !== 'voting') throw new Error(phase === 'closed' ? 'voting is closed' : 'voting opens when submissions close');
    const e = this.state.jamEntries.find((x) => x.jamId === j.id && x.gameId === gameId);
    if (!e || !this.entryStands(e)) throw new Error('not an entry of this jam');
    if (e.ownerId === voterId) throw new Error('you cannot vote on your own entry');
    const played = this.state.plays.some((p) => p.userId === voterId && p.versionId === e.versionId && p.durationS >= JAM.votePlayS && !JAM.voteExcludedSources.includes(p.source));
    if (!played) throw new Error(`play the entry for ${JAM.votePlayS} seconds before voting`);
    const now = new Date().toISOString();
    let v = this.state.jamVotes.find((x) => x.jamId === j.id && x.gameId === gameId && x.voterId === voterId);
    if (v) Object.assign(v, { fun: vote.fun, theme: vote.theme, look: vote.look, updatedAt: now });
    else {
      v = { jamId: j.id, gameId, voterId, fun: vote.fun, theme: vote.theme, look: vote.look, createdAt: now, updatedAt: now };
      this.state.jamVotes.push(v);
    }
    this.save();
    return { ...v };
  }

  async listJamVotes(jamId: string, voterId: string): Promise<JamVoteRow[]> {
    this.load();
    const j = this.jam(jamId);
    return this.state.jamVotes.filter((v) => v.jamId === j.id && v.voterId === voterId).map((v) => ({ ...v }));
  }

  async jamResults(jamId: string): Promise<JamResult[]> {
    this.load();
    const j = this.jam(jamId);
    if (jamPhase(j) !== 'closed') throw new Error('results are published when voting closes');
    return rankJam(
      this.state.jamEntries.filter((e) => e.jamId === j.id && this.entryStands(e)),
      this.state.jamVotes.filter((v) => v.jamId === j.id),
    );
  }
}
