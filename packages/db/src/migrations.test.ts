import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PlaySource, RatingTag } from '@gg/schemas';
import { beforeAll, describe, expect, it } from 'vitest';
import { heatmapFrom, heatRows, type HeatRow } from './heatmap';
import { computeStats } from './ranking';
import type { GameRow, PlayEventRow, PlayRow, RatingRow } from './types';

/**
 * Runs the Supabase migrations on an embedded Postgres (PGlite) and exercises the SQL functions: the core job and
 * version functions, the community functions, and parity between the SQL rank formula and ranking.ts.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const migration = (name: string) => readFileSync(`${root}supabase/migrations/${name}`, 'utf8');

// What Supabase provides and plain Postgres lacks: the API roles with Supabase's default grants (every new table and
// function in public is granted to them), the auth schema's users, uid() and role(), and storage buckets.
const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
`;

let db: PGlite;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = uuid(1);
const PLAYERS = [2, 3, 4, 5, 6, 7].map(uuid);
const TESTERS = [11, 12, 13].map(uuid);
const MODERATOR = uuid(21);
/** Owns the games of the last suite (OWNER ends the earlier moderation tests with three strikes). */
const OWNER2 = uuid(31);
const TESTER2 = uuid(32);

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  if (!r.rows[0]) throw new Error(`no row from: ${sql}`);
  return r.rows[0];
}
async function asService(): Promise<void> {
  await db.exec(`set request.jwt.claim.role = 'service_role'; set request.jwt.claim.sub = '';`);
}
async function asUser(id: string): Promise<void> {
  await db.exec(`set request.jwt.claim.role = 'authenticated'; set request.jwt.claim.sub = '${id}';`);
}
/** As a browser client signed in as `id` would reach the database through PostgREST: the authenticated role. */
async function asClient(id: string): Promise<void> {
  await db.exec(`set role authenticated; set request.jwt.claim.role = 'authenticated'; set request.jwt.claim.sub = '${id}';`);
}
async function asServer(): Promise<void> {
  await db.exec('reset role');
  await asService();
}
async function expectError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(p).rejects.toThrow(pattern);
}

/** A game with an accepted, published head version; `playtestPassed` sets the head's evidence. */
async function makeGame(slug: string, opts: { daysOld?: number; playtestPassed?: boolean; owner?: string } = {}): Promise<{ gameId: string; versionId: string }> {
  const g = await one<{ id: string }>(`insert into games (owner_id, slug, title, genre, created_at) values ($1, $2, $2, 'platformer', now() - make_interval(days => $3)) returning id`, [opts.owner ?? OWNER, slug, opts.daysOld ?? 3]);
  const design = JSON.stringify({ evidence: { playtest: { passed: opts.playtestPassed ?? true } } });
  const v = await one<{ id: string }>(`insert into game_versions (game_id, number, kind, bundle_path, design) values ($1, 1, 'stage', $2, $3::jsonb) returning id`, [g.id, `bundles/g/${g.id}/v/1`, design]);
  await db.query('select accept_version($1)', [v.id]);
  return { gameId: g.id, versionId: v.id };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  await db.exec(migration('0001_core.sql').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(migration('0003_community.sql'));
  await db.exec(migration('0004_moderation.sql'));
  await db.exec(migration('0005_play_events.sql'));
  await db.exec(migration('0006_appeals.sql'));
  await db.exec(migration('0007_training_pairs.sql'));
  for (const [i, id] of [OWNER, ...PLAYERS, ...TESTERS, MODERATOR, OWNER2, TESTER2].entries()) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into profiles (id, handle) values ($1, $2)', [id, `user_${i}`]);
  }
  await db.query('update profiles set is_moderator = true where id = $1', [MODERATOR]);
  await asService();
}, 120_000);

describe('core migration functions', () => {
  it('claim_job takes the highest-priority queued job; accept_version moves the head; fork_game records lineage', async () => {
    const { gameId, versionId } = await makeGame('core-game');
    await db.query(`insert into generation_jobs (game_id, user_id, kind, priority) values ($1, $2, 'create', 0), ($1, $2, 'edit_code', 5)`, [gameId, OWNER]);
    const job = await one<{ kind: string; status: string; worker_id: string }>(`select * from claim_job('w1')`);
    expect(job.kind).toBe('edit_code');
    expect(job.status).toBe('running');
    expect((await one<{ head_version_id: string; state: string }>('select head_version_id, state from games where id = $1', [gameId])).head_version_id).toBe(versionId);
    const fork = await one<{ id: string; remix_depth: number }>(`select * from fork_game($1, $2, 'core-game-remix', 'Remix')`, [versionId, PLAYERS[0]]);
    expect(fork.remix_depth).toBe(1);
    expect((await one<{ n: number }>('select count(*)::int as n from remix_lineage where game_id = $1 and ancestor_game_id = $2', [fork.id, gameId])).n).toBe(1);
  });
});

describe('community migration', () => {
  it('records plays and one rating per player, acting only as the signed-in user unless called with the service role', async () => {
    const { gameId, versionId } = await makeGame('rated-game');
    await db.query(`select record_play($1, $2, $3, 'feed', 45, true, 1, 2)`, [PLAYERS[0], gameId, versionId]);
    await db.query(`select rate_game($1, $2, 'fun')`, [PLAYERS[0], gameId]);
    await db.query(`select rate_game($1, $2, 'confusing', 3::smallint)`, [PLAYERS[0], gameId]);
    const rating = await one<{ tag: RatingTag; score: number }>('select tag, score from ratings where game_id = $1 and user_id = $2', [gameId, PLAYERS[0]]);
    expect(rating).toEqual({ tag: 'confusing', score: 3 });
    await asUser(PLAYERS[1]!);
    await expectError(db.query(`select rate_game($1, $2, 'fun')`, [PLAYERS[0], gameId]), /another user/);
    await db.query(`select rate_game(null, $1, 'fun')`, [gameId]);
    await asService();
    expect((await one<{ n: number }>('select count(*)::int as n from ratings where game_id = $1', [gameId])).n).toBe(2);
    await expectError(db.query(`select record_play($1, $2, $3, 'feed', 10, false, 0, 0)`, [PLAYERS[0], gameId, uuid(999)]), /version not found/);
  });

  it('computes the same stats and rank score as ranking.ts on the same rows', async () => {
    const { gameId, versionId } = await makeGame('parity-game', { daysOld: 5 });
    const now = new Date('2026-10-20T12:00:00Z');
    const day = (d: number, h = 10) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
    const plays: Array<[string, PlaySource, number, boolean, string]> = [
      [PLAYERS[0]!, 'feed', 1500, true, day(18)],
      [PLAYERS[0]!, 'feed', 4000, false, day(18, 14)], // same day: the 60-minute cap applies to the sum
      [PLAYERS[0]!, 'direct', 600, false, day(19)],
      [PLAYERS[1]!, 'feed', 20, false, day(19)], // never qualifies
      [PLAYERS[2]!, 'remix', 95, true, day(19)],
      [PLAYERS[3]!, 'featured', 900, true, day(19)], // featured traffic does not count
      [PLAYERS[4]!, 'test', 900, true, day(19)], // nor do test plays
      [OWNER, 'feed', 3000, true, day(19)], // nor the owner's own plays
      [PLAYERS[5]!, 'search', 120, false, day(20)],
      [PLAYERS[5]!, 'feed', 31, false, day(20)],
    ];
    for (const [user, source, duration, completed, at] of plays) {
      await db.query(`insert into plays (game_id, version_id, user_id, source, duration_s, completed, created_at) values ($1, $2, $3, $4, $5, $6, $7)`, [gameId, versionId, user, source, duration, completed, at]);
    }
    const tags: Array<[string, RatingTag]> = [[PLAYERS[0]!, 'fun'], [PLAYERS[1]!, 'confusing'], [PLAYERS[2]!, 'fun'], [PLAYERS[3]!, 'ugly'], [PLAYERS[4]!, 'broken'], [OWNER, 'fun']];
    for (const [user, tag] of tags) await db.query(`select rate_game($1, $2, $3)`, [user, gameId, tag]);
    const fork = await one<{ id: string }>(`select * from fork_game($1, $2, 'parity-game-remix', 'Remix')`, [versionId, PLAYERS[5]]);
    expect(fork.id).toBeTruthy();

    const sql = await one<Record<string, number | boolean | string>>('select * from game_stats_for($1, $2)', [gameId, now.toISOString()]);
    const gameRow = await one<{ id: string; owner_id: string; created_at: Date }>('select id, owner_id, created_at from games where id = $1', [gameId]);
    const playRows = (await db.query<{ user_id: string; source: PlaySource; duration_s: number; completed: boolean; created_at: Date }>('select * from plays where game_id = $1', [gameId])).rows;
    const ratingRows = (await db.query<{ user_id: string; tag: RatingTag }>('select * from ratings where game_id = $1', [gameId])).rows;
    const ts = computeStats({
      game: { id: gameId, ownerId: gameRow.owner_id, createdAt: gameRow.created_at.toISOString() } as GameRow,
      plays: playRows.map((p) => ({ gameId, versionId, userId: p.user_id, source: p.source, durationS: Number(p.duration_s), completed: p.completed, createdAt: p.created_at.toISOString() }) as PlayRow),
      ratings: ratingRows.map((r) => ({ gameId, userId: r.user_id, tag: r.tag }) as RatingRow),
      remixes: 1,
      now,
    });
    expect(sql['players']).toBe(ts.players);
    expect(sql['qualified_players']).toBe(ts.qualifiedPlayers);
    expect(sql['plays']).toBe(ts.plays);
    expect(sql['rating_count']).toBe(ts.ratingCount);
    expect({ fun: sql['fun'], confusing: sql['confusing'], broken: sql['broken'], ugly: sql['ugly'] }).toEqual(ts.ratings);
    expect(sql['remixes']).toBe(1);
    for (const [col, value] of [['completion_rate', ts.completionRate], ['avg_play_min', ts.avgPlayMin], ['engagement', ts.engagement], ['quality', ts.quality], ['rank_score', ts.rankScore]] as const) {
      expect(Number(sql[col]), col).toBeCloseTo(value, 5);
    }
    expect(sql['is_broken']).toBe(ts.broken);
    // The scenario exercises every rule: 3 counted players qualify (one only through a later feed play), one capped day.
    expect(ts.players).toBe(4);
    expect(ts.qualifiedPlayers).toBe(3);
    expect(ts.avgPlayMin).toBeCloseTo((60 + 10 + 95 / 60 + 31 / 60) / 3, 5);
  });

  it('lists only games that passed their playtest, keeps broken games out of the feed and ranks the rest', async () => {
    const good = await makeGame('feed-good', { daysOld: 1 });
    const failed = await makeGame('feed-failed', { daysOld: 1, playtestPassed: false });
    const hated = await makeGame('feed-hated', { daysOld: 1 });
    await db.query('select set_listed($1, $2, true)', [OWNER, good.gameId]);
    await expectError(db.query('select set_listed($1, $2, true)', [OWNER, failed.gameId]), /playtest passed/);
    await expectError(db.query('select set_listed($1, $2, true)', [PLAYERS[0], good.gameId]), /game not found/);
    await db.query('select set_listed($1, $2, true)', [OWNER, hated.gameId]);
    for (const p of PLAYERS) {
      await db.query(`select record_play($1, $2, $3, 'feed', 300, true, 1, 0)`, [p, good.gameId, good.versionId]);
      await db.query(`select rate_game($1, $2, 'fun')`, [p, good.gameId]);
      await db.query(`select rate_game($1, $2, 'broken')`, [p, hated.gameId]);
    }
    const feed = (await db.query<{ game_id: string; rank_score: number }>('select game_id, rank_score from feed(50)')).rows.map((r) => r.game_id);
    expect(feed).toContain(good.gameId);
    expect(feed).not.toContain(hated.gameId);
    expect(feed).not.toContain(failed.gameId);
    expect(feed.indexOf(good.gameId)).toBe(0);
    expect(await one<{ n: number }>('select refresh_game_stats() as n')).toEqual({ n: expect.any(Number) });
    expect((await one<{ is_broken: boolean }>('select is_broken from game_stats where game_id = $1', [hated.gameId])).is_broken).toBe(true);
    const unlisted = await one<{ visibility: string; state: string }>('select * from set_listed($1, $2, false)', [OWNER, good.gameId]);
    expect(unlisted).toMatchObject({ visibility: 'unlisted', state: 'playable' });
  });

  it('runs a rewarded test round: claim, play 30 s, report, get paid, close on the majority verdict', async () => {
    const { gameId, versionId } = await makeGame('tested-game');
    await expectError(db.query('select enqueue_test($1, $2, $3)', [PLAYERS[0], gameId, versionId]), /game not found/);
    const q = await one<{ id: string; needed: number }>('select * from enqueue_test($1, $2, $3, 3, 5)', [OWNER, gameId, versionId]);
    expect((await one<{ id: string }>('select * from enqueue_test($1, $2, $3)', [OWNER, gameId, versionId])).id).toBe(q.id);
    expect((await db.query('select * from claim_test($1) where id is not null', [OWNER])).rows).toHaveLength(0);
    const verdicts = ['works', 'broken', 'works'] as const;
    for (const [i, tester] of TESTERS.entries()) {
      const a = await one<{ id: string; queue_id: string }>('select * from claim_test($1)', [tester]);
      expect(a.queue_id).toBe(q.id);
      expect((await one<{ id: string }>('select * from claim_test($1)', [tester])).id).toBe(a.id);
      await expectError(db.query(`select submit_test($1, $2, 'works', 'fun')`, [tester, a.id]), /at least 30 s/);
      await db.query(`select record_play($1, $2, $3, 'test', 42, false, 0, 1)`, [tester, gameId, versionId]);
      await db.query(`select submit_test($1, $2, $3, 'fun', 'checked the first cavern')`, [tester, a.id, verdicts[i]]);
      await expectError(db.query(`select submit_test($1, $2, 'works', 'fun')`, [tester, a.id]), /already submitted/);
      expect((await one<{ credits_balance: number }>('select credits_balance from profiles where id = $1', [tester])).credits_balance).toBe(5);
    }
    const closed = await one<{ status: string; outcome: string }>('select status, outcome from test_queue where id = $1', [q.id]);
    expect(closed).toEqual({ status: 'closed', outcome: 'works' });
    const listing = await one<{ listing: { tested?: { outcome: string } } }>('select listing from games where id = $1', [gameId]);
    expect(listing.listing.tested?.outcome).toBe('works');
    expect((await one<{ n: number }>(`select count(*)::int as n from credits_ledger where reason = 'test_reward'`)).n).toBe(3);
  });

  it('a tied or broken test round keeps the version out of the feed', async () => {
    const { gameId, versionId } = await makeGame('broken-round');
    const q = await one<{ id: string }>('select * from enqueue_test($1, $2, $3, 2, 0)', [OWNER, gameId, versionId]);
    for (const [tester, verdict] of [[TESTERS[0], 'works'], [TESTERS[1], 'broken']] as const) {
      const a = await one<{ id: string }>('select * from claim_test($1)', [tester]);
      await db.query(`select record_play($1, $2, $3, 'test', 60, false, 0, 0)`, [tester, gameId, versionId]);
      await db.query(`select submit_test($1, $2, $3, 'broken')`, [tester, a.id, verdict]);
    }
    expect((await one<{ outcome: string }>('select outcome from test_queue where id = $1', [q.id])).outcome).toBe('broken');
    await expectError(db.query('select set_listed($1, $2, true)', [OWNER, gameId]), /reported this version broken/);
    expect((await one<{ is_broken: boolean }>('select is_broken from game_stats_for($1)', [gameId])).is_broken).toBe(true);
  });
});

describe('moderation migration', () => {
  it('suspends a game on three players\' reports, restores it when moderators dismiss them, and strikes on warn', async () => {
    const { gameId } = await makeGame('reported-game');
    await db.query('select set_listed($1, $2, true)', [OWNER, gameId]);
    await expectError(db.query(`select report_game($1, $2, 'abuse')`, [OWNER, gameId]), /your own game/);
    const ids: string[] = [];
    for (const p of PLAYERS.slice(0, 3)) ids.push((await one<{ id: string }>(`select * from report_game($1, $2, 'abuse', 'offensive text')`, [p, gameId])).id);
    expect((await one<{ id: string }>(`select * from report_game($1, $2, 'abuse', 'again')`, [PLAYERS[0], gameId])).id).toBe(ids[0]);
    expect((await one<{ state: string }>('select state from games where id = $1', [gameId])).state).toBe('suspended');
    expect((await db.query<{ game_id: string }>('select game_id from feed(50)')).rows.map((r) => r.game_id)).not.toContain(gameId);
    await expectError(db.query('select set_listed($1, $2, true)', [OWNER, gameId]), /suspended/);
    await expectError(db.query(`select resolve_report($1, $2, 'dismiss')`, [PLAYERS[4], ids[0]]), /only moderators/);
    await expectError(db.query(`select resolve_report($1, $2, 'license')`, [MODERATOR, ids[0]]), /only ip reports/);
    await db.query(`select resolve_report($1, $2, 'warn', 'first warning')`, [MODERATOR, ids[0]]);
    expect((await one<{ state: string }>('select state from games where id = $1', [gameId])).state).toBe('published');
    expect((await one<{ n: number }>('select active_strikes($1) as n', [OWNER])).n).toBe(1);
    await db.query(`select resolve_report($1, $2, 'dismiss')`, [MODERATOR, ids[1]]);
    await expectError(db.query(`select resolve_report($1, $2, 'dismiss')`, [MODERATOR, ids[1]]), /already resolved/);
  });

  it('removes a game with a takedown record, closes its other reports, and blocks listing at three strikes', async () => {
    const { gameId } = await makeGame('ip-game');
    const ip = await one<{ id: string }>(`select * from report_game($1, $2, 'ip', 'my character', true)`, [PLAYERS[3], gameId]);
    const other = await one<{ id: string }>(`select * from report_game($1, $2, 'broken')`, [PLAYERS[4], gameId]);
    await db.query(`select resolve_report($1, $2, 'remove', 'DMCA notice 42')`, [MODERATOR, ip.id]);
    expect(await one('select state, visibility from games where id = $1', [gameId])).toEqual({ state: 'removed', visibility: 'unlisted' });
    expect((await one<{ status: string; resolution: string }>('select status, resolution from reports where id = $1', [other.id]))).toEqual({ status: 'resolved', resolution: 'remove' });
    expect((await one<{ action: string; terms: string }>('select action, terms from takedowns where game_id = $1', [gameId]))).toEqual({ action: 'removed', terms: 'DMCA notice 42' });
    expect((await one<{ n: number }>('select active_strikes($1) as n', [OWNER])).n).toBe(2);
    const licensed = await makeGame('licensed-game');
    const claim = await one<{ id: string }>(`select * from report_game($1, $2, 'ip')`, [PLAYERS[5], licensed.gameId]);
    await db.query(`select resolve_report($1, $2, 'license', 'licensed for 12 months')`, [MODERATOR, claim.id]);
    expect((await one<{ listing: { license?: { terms: string } } }>('select listing from games where id = $1', [licensed.gameId])).listing.license?.terms).toBe('licensed for 12 months');
    const third = await makeGame('third-strike');
    const warn = await one<{ id: string }>(`select * from report_game($1, $2, 'other', 'spam')`, [PLAYERS[0], third.gameId]);
    await db.query(`select resolve_report($1, $2, 'warn')`, [MODERATOR, warn.id]);
    await expectError(db.query('select set_listed($1, $2, true)', [OWNER, third.gameId]), /3 active strikes/);
  });
});

describe('moderation migration: unlisting, remixes and privileges', () => {
  const state = async (gameId: string) => one<{ state: string; visibility: string }>('select state, visibility from games where id = $1', [gameId]);
  /** A remix as the store makes one: fork_game, then a copy of the origin version as the remix's head. */
  async function remix(origin: { versionId: string }, owner: string, slug: string, ownBundle = false): Promise<string> {
    const fork = await one<{ id: string }>(`select * from fork_game($1, $2, $3, $3)`, [origin.versionId, owner, slug]);
    const src = await one<{ bundle_path: string; design: unknown }>('select bundle_path, design from game_versions where id = $1', [origin.versionId]);
    const path = ownBundle ? `bundles/g/${fork.id}/v/2` : src.bundle_path;
    const v = await one<{ id: string }>(`insert into game_versions (game_id, number, kind, bundle_path, design) values ($1, 1, 'accepted', $2, $3::jsonb) returning id`, [fork.id, path, JSON.stringify(src.design)]);
    await db.query('select accept_version($1)', [v.id]);
    return fork.id;
  }

  it('unlists a confirmed broken game without a strike until a new version is accepted; warn is refused on broken', async () => {
    const { gameId } = await makeGame('broken-unlist', { owner: OWNER2 });
    await db.query('select set_listed($1, $2, true)', [OWNER2, gameId]);
    const a = await one<{ id: string }>(`select * from report_game($1, $2, 'broken', 'falls through the floor')`, [PLAYERS[0], gameId]);
    await db.query(`select * from report_game($1, $2, 'broken')`, [PLAYERS[1], gameId]);
    await expectError(db.query(`select resolve_report($1, $2, 'warn')`, [MODERATOR, a.id]), /not misconduct/);
    await db.query(`select resolve_report($1, $2, 'unlist', 'confirmed: level 2 floor')`, [MODERATOR, a.id]);
    expect(await state(gameId)).toEqual({ state: 'playable', visibility: 'unlisted' });
    expect((await one<{ n: number }>(`select count(*)::int as n from reports where game_id = $1 and status = 'open'`, [gameId])).n).toBe(0);
    expect((await one<{ n: number }>('select active_strikes($1) as n', [OWNER2])).n).toBe(0);
    await expectError(db.query('select set_listed($1, $2, true)', [OWNER2, gameId]), /moderator unlisted this version/);
    const fixed = await one<{ id: string }>(`insert into game_versions (game_id, number, kind, bundle_path, design) values ($1, 2, 'stage', $2, '{"evidence":{"playtest":{"passed":true}}}'::jsonb) returning id`, [gameId, `bundles/g/${gameId}/v/2`]);
    await db.query('select accept_version($1)', [fixed.id]);
    await db.query('select set_listed($1, $2, true)', [OWNER2, gameId]);
    expect(await state(gameId)).toEqual({ state: 'published', visibility: 'listed' });
    const next = await one<{ id: string }>(`insert into game_versions (game_id, number, kind, bundle_path) values ($1, 3, 'stage', $2) returning id`, [gameId, `bundles/g/${gameId}/v/3`]);
    await db.query('select accept_version($1)', [next.id]);
    expect(await state(gameId)).toEqual({ state: 'published', visibility: 'listed' });
  });

  it('takes down unedited remixes with the game, not edited ones, and refuses remixes of moderated games', async () => {
    const origin = await makeGame('remixed-origin', { owner: OWNER2 });
    const copy = await remix(origin, PLAYERS[1]!, 'remixed-copy');
    const copyOfCopy = await remix({ versionId: (await one<{ head_version_id: string }>('select head_version_id from games where id = $1', [copy])).head_version_id }, PLAYERS[2]!, 'remixed-copy-2');
    const edited = await remix(origin, PLAYERS[3]!, 'remixed-edited', true);
    const ip = await one<{ id: string }>(`select * from report_game($1, $2, 'ip', 'my sprites', true)`, [PLAYERS[4], origin.gameId]);
    const onCopy = await one<{ id: string }>(`select * from report_game($1, $2, 'ip', 'same sprites')`, [PLAYERS[0], copy]);
    await db.query(`select resolve_report($1, $2, 'remove', 'DMCA notice 43')`, [MODERATOR, ip.id]);
    expect(await one('select status, resolution from reports where id = $1', [onCopy.id])).toEqual({ status: 'resolved', resolution: 'remove' });
    await expectError(db.query(`select * from report_game($1, $2, 'abuse')`, [PLAYERS[5], origin.gameId]), /already removed/);
    for (const id of [origin.gameId, copy, copyOfCopy]) expect((await state(id)).state).toBe('removed');
    expect((await state(edited)).state).toBe('playable');
    expect((await one<{ n: number }>(`select count(*)::int as n from takedowns where report_id = $1`, [ip.id])).n).toBe(3);
    expect((await one<{ n: number }>('select active_strikes($1) as n', [PLAYERS[1]])).n).toBe(0);
    // A job queued before the takedown cannot bring the game back by accepting a version.
    const late = await one<{ id: string }>(`insert into game_versions (game_id, number, kind, bundle_path) values ($1, 2, 'stage', $2) returning id`, [origin.gameId, `bundles/g/${origin.gameId}/v/2`]);
    await db.query('select accept_version($1)', [late.id]);
    expect((await state(origin.gameId)).state).toBe('removed');
    await expectError(db.query(`select * from fork_game($1, $2, 'again', 'Again')`, [origin.versionId, PLAYERS[5]]), /removed; it cannot be remixed/);
    const suspended = await makeGame('suspended-origin', { owner: OWNER2 });
    await db.query('select enqueue_test($1, $2, $3, 1, 5)', [OWNER2, suspended.gameId, suspended.versionId]);
    for (const p of PLAYERS.slice(0, 3)) await db.query(`select * from report_game($1, $2, 'abuse')`, [p, suspended.gameId]);
    expect((await one<{ game_id: string | null }>('select (claim_test($1)).game_id', [TESTER2])).game_id).not.toBe(suspended.gameId);
    await expectError(db.query('select enqueue_test($1, $2, $3)', [OWNER2, suspended.gameId, suspended.versionId]), /testers cannot be asked/);
    await expectError(db.query(`select * from fork_game($1, $2, 'sus', 'Sus')`, [suspended.versionId, PLAYERS[5]]), /suspended; it cannot be remixed/);
  });

  it('lets a signed-in client write only its presentation fields and call only the functions that check the caller', async () => {
    const { gameId, versionId } = await makeGame('locked-game', { owner: OWNER2 });
    await db.query(`insert into generation_jobs (game_id, user_id, kind) values ($1, $2, 'create')`, [gameId, OWNER2]);
    try {
      await asClient(OWNER2);
      await expectError(db.query(`update games set state = 'published', visibility = 'listed' where id = $1`, [gameId]), /permission denied/);
      await expectError(db.query(`update games set head_version_id = null where id = $1`, [gameId]), /permission denied/);
      await db.query(`update games set title = 'Renamed' where id = $1`, [gameId]);
      await expectError(db.query('update profiles set is_moderator = true where id = $1', [OWNER2]), /permission denied/);
      await expectError(db.query('update profiles set credits_balance = 1000 where id = $1', [OWNER2]), /permission denied/);
      await db.query(`update profiles set display_name = 'Owner' where id = $1`, [OWNER2]);
      await expectError(db.query(`insert into generation_jobs (game_id, user_id, kind) values ($1, $2, 'edit_code')`, [gameId, OWNER2]), /permission denied/);
      await expectError(db.query(`select claim_job('w-intruder')`), /permission denied/);
      await expectError(db.query('select accept_version($1)', [versionId]), /permission denied/);
      await expectError(db.query('select active_strikes($1)', [OWNER2]), /permission denied/);
      await asClient(PLAYERS[0]!);
      await expectError(db.query(`select * from fork_game($1, $2, 'for-someone', 'X')`, [versionId, PLAYERS[1]]), /another user/);
      const mine = await one<{ owner_id: string }>(`select * from fork_game($1, null, 'locked-game-remix', 'Mine')`, [versionId]);
      expect(mine.owner_id).toBe(PLAYERS[0]);
      expect((await one<{ kind: string }>(`select * from report_game(null, $1, 'other', 'test')`, [gameId])).kind).toBe('other');
    } finally {
      await asServer();
    }
    expect(await one('select g.title, p.display_name, p.is_moderator from games g join profiles p on p.id = g.owner_id where g.id = $1', [gameId])).toEqual({ title: 'Renamed', display_name: 'Owner', is_moderator: false });
    expect((await one<{ status: string }>(`select status from generation_jobs where game_id = $1`, [gameId])).status).toBe('queued');
  });
});

describe('play events migration', () => {
  it('records one batch of events per play by its player and serves the owner the same heatmap as heatRows', async () => {
    const { gameId, versionId } = await makeGame('heat-game', { owner: OWNER2 });
    const ev = (kind: string, level: string, x: number, y: number, t = 1) => ({ kind, level, x, y, t });
    const sessions: Array<[string, ReturnType<typeof ev>[]]> = [
      [PLAYERS[0]!, [ev('sample', 'L01', 10, 20), ev('death', 'L01', 33, 47), ev('death', 'L01', 40, 40.5, 2.5), ev('sample', 'L02', 5, 5), ev('quit', 'L02', 7, 9)]],
      [PLAYERS[1]!, [ev('death', 'L01', 35, 33), ev('death', 'L01', -3, 0), ev('sample', 'L01', 250.75, 31.9)]],
      [OWNER2, [ev('death', 'L01', 35, 33), ev('sample', 'L03', 0, 0)]],
    ];
    const rows: PlayEventRow[] = [];
    for (const [user, events] of sessions) {
      const p = await one<{ id: string }>(`select * from record_play($1, $2, $3, 'feed', 60, false, 0, 2)`, [user, gameId, versionId]);
      expect((await one<{ n: number }>('select record_play_events($1, $2, $3::jsonb) as n', [user, p.id, JSON.stringify(events)])).n).toBe(events.length);
      for (const e of events) rows.push({ ...e, kind: e.kind as PlayEventRow['kind'], playId: p.id, gameId, versionId, userId: user });
      await expectError(db.query('select record_play_events($1, $2, $3::jsonb)', [user, p.id, JSON.stringify(events)]), /already has its events/);
    }
    const other = await one<{ id: string }>(`select * from record_play($1, $2, $3, 'feed', 10, false, 0, 0)`, [PLAYERS[2], gameId, versionId]);
    await expectError(db.query(`select record_play_events($1, $2, '[]'::jsonb)`, [PLAYERS[3], other.id]), /play not found/);
    await expectError(db.query(`select record_play_events($1, $2, '[{"kind":"teleport","level":"L01","x":0,"y":0,"t":0}]'::jsonb)`, [PLAYERS[2], other.id]), /invalid input value for enum/);
    await expectError(db.query(`select record_play_events($1, $2, '{"kind":"death"}'::jsonb)`, [PLAYERS[2], other.id]), /must be an array/);
    for (const cell of [16, 7]) {
      const sql = (await db.query<Record<string, unknown>>('select * from play_heatmap($1, $2, $3, $4)', [OWNER2, gameId, versionId, cell])).rows.map((r) => ({ levelId: r['level_id'], kind: r['kind'], cx: r['cx'], cy: r['cy'], n: r['n'], plays: r['plays'] }) as HeatRow);
      expect(heatmapFrom(sql, versionId, cell)).toEqual(heatmapFrom(heatRows(rows, { versionId, ownerId: OWNER2, cell }), versionId, cell));
    }
    const heat = heatmapFrom((await db.query<Record<string, unknown>>('select * from play_heatmap($1, $2, $3)', [OWNER2, gameId, versionId])).rows.map((r) => ({ levelId: r['level_id'], kind: r['kind'], cx: r['cx'], cy: r['cy'], n: r['n'], plays: r['plays'] }) as HeatRow), versionId, 16);
    expect(heat.levels['L01']).toEqual({ plays: 2, death: [{ x: 2, y: 2, n: 3 }, { x: -1, y: 0, n: 1 }], quit: [], sample: [{ x: 0, y: 1, n: 1 }, { x: 15, y: 1, n: 1 }] });
    expect(heat.levels['L03']).toBeUndefined();
    await expectError(db.query('select * from play_heatmap($1, $2, $3)', [PLAYERS[0], gameId, versionId]), /game not found/);
    await expectError(db.query('select * from play_heatmap($1, $2, $3, 0)', [OWNER2, gameId, versionId]), /cell must be/);
    // Row-level security with no policy: a signed-in client sees no positions, not even its own.
    expect((await one<{ n: number }>('select count(*)::int as n from play_events where game_id = $1', [gameId])).n).toBe(rows.length);
    try {
      await asClient(PLAYERS[0]!);
      expect((await one<{ n: number }>('select count(*)::int as n from play_events where game_id = $1', [gameId])).n).toBe(0);
    } finally {
      await asServer();
    }
  });
});

describe('appeals migration', () => {
  const state = async (gameId: string) => (await one<{ state: string }>('select state from games where id = $1', [gameId])).state;
  const statement = 'This board is my own work; the sprites were drawn by me in 2026.';

  it('a counter-notice needs consent, waits 14 days, then reinstates the game and its remixes and voids the strike', async () => {
    const origin = await makeGame('appealed-origin', { owner: OWNER2 });
    const fork = await one<{ id: string }>(`select * from fork_game($1, $2, 'appealed-copy', 'Copy')`, [origin.versionId, PLAYERS[1]]);
    const copyV = await one<{ id: string }>(`insert into game_versions (game_id, number, kind, bundle_path) values ($1, 1, 'accepted', $2) returning id`, [fork.id, `bundles/g/${origin.gameId}/v/1`]);
    await db.query('select accept_version($1)', [copyV.id]);
    const ip = await one<{ id: string }>(`select * from report_game($1, $2, 'ip', 'my sprites', true)`, [PLAYERS[4], origin.gameId]);
    const strikes0 = (await one<{ n: number }>('select active_strikes($1) as n', [OWNER2])).n;
    await db.query(`select resolve_report($1, $2, 'remove', 'DMCA notice 44')`, [MODERATOR, ip.id]);
    expect((await one<{ n: number }>('select active_strikes($1) as n', [OWNER2])).n).toBe(strikes0 + 1);
    await expectError(db.query('select * from appeal_takedown($1, $2, $3, $4, $5)', [OWNER2, origin.gameId, statement, 'Owner Two', 'two@example.com']), /consent/);
    await expectError(db.query('select * from appeal_takedown($1, $2, $3, $4, $5, true)', [PLAYERS[0], origin.gameId, statement, 'Not Me', 'x@example.com']), /game not found/);
    const appeal = await one<{ id: string; reinstate_after: string; created_at: string }>('select * from appeal_takedown($1, $2, $3, $4, $5, true)', [OWNER2, origin.gameId, statement, 'Owner Two', 'two@example.com']);
    expect(Math.round((Date.parse(appeal.reinstate_after) - Date.parse(appeal.created_at)) / 86_400_000)).toBe(14);
    await expectError(db.query('select * from appeal_takedown($1, $2, $3, $4, $5, true)', [OWNER2, origin.gameId, statement, 'Owner Two', 'two@example.com']), /already appealed/);
    await expectError(db.query(`select * from decide_appeal($1, $2, 'reinstate')`, [PLAYERS[0], appeal.id]), /only moderators/);
    await expectError(db.query(`select * from decide_appeal($1, $2, 'reinstate')`, [MODERATOR, appeal.id]), /waits 14 days/);
    // The claimant's window passes without a court action.
    await db.query(`update appeals set reinstate_after = now() - interval '1 minute' where id = $1`, [appeal.id]);
    const decided = await one<{ status: string; decided_by: string }>(`select * from decide_appeal($1, $2, 'reinstate', 'no court action in 14 days')`, [MODERATOR, appeal.id]);
    expect(decided).toMatchObject({ status: 'reinstated', decided_by: MODERATOR });
    expect([await state(origin.gameId), await state(fork.id)]).toEqual(['playable', 'playable']);
    expect((await one<{ n: number }>('select count(*)::int as n from takedowns where report_id = $1 and reverted_at is null', [ip.id])).n).toBe(0);
    expect((await one<{ n: number }>('select active_strikes($1) as n', [OWNER2])).n).toBe(strikes0);
    await expectError(db.query(`select * from decide_appeal($1, $2, 'uphold')`, [MODERATOR, appeal.id]), /already decided/);
  });

  it('a plain appeal of an abuse removal can be decided at once; upholding keeps the game down for good', async () => {
    const { gameId } = await makeGame('appealed-abuse', { owner: OWNER2 });
    const r = await one<{ id: string }>(`select * from report_game($1, $2, 'abuse', 'slurs')`, [PLAYERS[2], gameId]);
    await db.query(`select resolve_report($1, $2, 'remove')`, [MODERATOR, r.id]);
    const appeal = await one<{ id: string }>('select * from appeal_takedown($1, $2, $3, $4, $5)', [OWNER2, gameId, statement, 'Owner Two', 'two@example.com']);
    expect((await one<{ status: string }>(`select * from decide_appeal($1, $2, 'uphold', 'the title is a slur')`, [MODERATOR, appeal.id])).status).toBe('upheld');
    expect(await state(gameId)).toBe('removed');
    await expectError(db.query('select * from appeal_takedown($1, $2, $3, $4, $5)', [OWNER2, gameId, statement, 'Owner Two', 'two@example.com']), /already appealed/);
    const other = await makeGame('appealed-abuse-2', { owner: OWNER2 });
    const r2 = await one<{ id: string }>(`select * from report_game($1, $2, 'abuse', 'mistaken')`, [PLAYERS[3], other.gameId]);
    await db.query(`select resolve_report($1, $2, 'remove')`, [MODERATOR, r2.id]);
    const a2 = await one<{ id: string }>('select * from appeal_takedown($1, $2, $3, $4, $5)', [OWNER2, other.gameId, statement, 'Owner Two', 'two@example.com']);
    await db.query(`select * from decide_appeal($1, $2, 'reinstate')`, [MODERATOR, a2.id]);
    expect(await state(other.gameId)).toBe('playable');
    await expectError(db.query('select * from appeal_takedown($1, $2, $3, $4, $5)', [OWNER2, other.gameId, statement, 'Owner Two', 'two@example.com']), /only a removed game/);
  });
});

describe('training pairs migration', () => {
  const pairsNaming = async (id: string) => (await one<{ n: number }>('select count(*)::int as n from training_pairs where $1 = any(contributors)', [id])).n;
  const insertPair = (contributors: string[]) =>
    db.query<{ id: string }>(`insert into training_pairs (stage, artifact, input, output, input_hash, contributors) values ('systems', 'SystemsJson', '{"system":"s","prompt":"p"}', '{}', 'h1', $1::uuid[]) returning id`, [contributors]);

  it('opting out deletes the pairs a user is in and keeps new ones from being stored; clients cannot read pairs', async () => {
    const fan = PLAYERS[5]!;
    expect((await insertPair([OWNER2, fan])).rows).toHaveLength(1);
    expect((await insertPair([OWNER2])).rows).toHaveLength(1);
    await asClient(fan);
    await expectError(db.query('select count(*) from training_pairs'), /permission denied/);
    await expectError(db.query(`insert into training_pairs (stage, input, contributors) values ('systems', '{}', '{}')`), /permission denied/);
    // The client updates its own profile; the security-definer trigger reaches the service-only table.
    await db.query('update profiles set training_opt_out = true where id = $1', [fan]);
    await asServer();
    expect(await pairsNaming(fan)).toBe(0);
    expect(await pairsNaming(OWNER2)).toBe(1);
    expect((await insertPair([OWNER2, fan])).rows).toHaveLength(0);
    await db.query('update profiles set training_opt_out = false where id = $1', [fan]);
    expect((await insertPair([fan])).rows).toHaveLength(1);
  });

  it('deleting a profile deletes the pairs it is in, and a game going deletes its pairs', async () => {
    const gone = uuid(41);
    await db.query('insert into auth.users (id) values ($1)', [gone]);
    await db.query(`insert into profiles (id, handle) values ($1, 'leaver')`, [gone]);
    await insertPair([gone, OWNER2]);
    await db.query('delete from profiles where id = $1', [gone]);
    expect(await pairsNaming(gone)).toBe(0);
    const { gameId } = await makeGame('distilled-game', { owner: OWNER2 });
    await db.query(`insert into training_pairs (stage, input, game_id, contributors) values ('behaviour', '{}', $1, array[$2]::uuid[])`, [gameId, OWNER2]);
    const before = await pairsNaming(OWNER2);
    await db.query('delete from games where id = $1', [gameId]);
    expect(await pairsNaming(OWNER2)).toBe(before - 1);
  });
});
