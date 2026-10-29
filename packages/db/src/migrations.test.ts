import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PlaySource, RatingTag } from '@gg/schemas';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeStats } from './ranking';
import type { GameRow, PlayRow, RatingRow } from './types';

/**
 * Runs the Supabase migrations on an embedded Postgres (PGlite) and exercises the SQL functions: the core job and
 * version functions, the community functions, and parity between the SQL rank formula and ranking.ts.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const migration = (name: string) => readFileSync(`${root}supabase/migrations/${name}`, 'utf8');

// What Supabase provides and plain Postgres lacks: the auth schema's users, uid() and role(), and storage buckets.
const SHIM = `
create schema if not exists auth;
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
async function expectError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(p).rejects.toThrow(pattern);
}

/** A game with an accepted, published head version; `playtestPassed` sets the head's evidence. */
async function makeGame(slug: string, opts: { daysOld?: number; playtestPassed?: boolean } = {}): Promise<{ gameId: string; versionId: string }> {
  const g = await one<{ id: string }>(`insert into games (owner_id, slug, title, genre, created_at) values ($1, $2, $2, 'platformer', now() - make_interval(days => $3)) returning id`, [OWNER, slug, opts.daysOld ?? 3]);
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
  for (const [i, id] of [OWNER, ...PLAYERS, ...TESTERS].entries()) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into profiles (id, handle) values ($1, $2)', [id, `user_${i}`]);
  }
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
