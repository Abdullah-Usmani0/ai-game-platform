import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileStore } from './file-store';
import { computeStats, RANKING } from './ranking';
import type { GameRow, PlayRow, RatingRow } from './types';

/** The file store follows the same community rules as 0003_community.sql (see migrations.test.ts for the SQL side). */
async function storeWithGame(opts: { playtestPassed?: boolean } = {}) {
  const store = new FileStore(mkdtempSync(join(tmpdir(), 'gg-community-')));
  const game = await store.createGame({ ownerId: 'owner', slug: 'g-one', title: 'One', genre: 'platformer' });
  const v = await store.insertVersion({ gameId: game.id, kind: 'stage', stage: 'publish', parentVersionId: null, jobId: null, sourcePath: 'checkpoints/x.tgz', bundlePath: `bundles/g/${game.id}/v/1`, manifest: null, design: { evidence: { playtest: { passed: opts.playtestPassed ?? true } } }, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: 1 });
  await store.acceptVersion(v.id);
  return { store, gameId: game.id, versionId: v.id };
}
const play = (versionId: string, userId: string, durationS: number, extra: Partial<PlayRow> = {}) => ({ gameId: '', versionId, userId, source: 'feed' as const, durationS, completed: false, levelsCompleted: 0, deaths: 0, ...extra });

describe('ranking', () => {
  const game = { id: 'g', ownerId: 'owner', createdAt: '2026-10-01T00:00:00Z' } as GameRow;
  const now = new Date('2026-10-01T00:00:00Z');
  it('an unrated, unplayed new game sits at the priors', () => {
    const s = computeStats({ game, plays: [], ratings: [], remixes: 0, now });
    expect(s.engagement).toBeCloseTo(RANKING.priorEngagement, 6);
    expect(s.quality).toBeCloseTo(0.5, 6);
    expect(s.rankScore).toBeCloseTo(0.6 * 0.3 + 0.4 * 0.5, 6);
    expect(s.broken).toBe(false);
  });
  it('ignores the owner and excluded traffic, caps a player at 60 minutes a day and halves freshness after 14 days', () => {
    const at = (d: string) => ({ createdAt: d, gameId: 'g', versionId: 'v', levelsCompleted: 0, deaths: 0, id: d });
    const plays: PlayRow[] = [
      { ...at('2026-10-01T01:00:00Z'), userId: 'a', source: 'feed', durationS: 7200, completed: true },
      { ...at('2026-10-01T02:00:00Z'), userId: 'owner', source: 'feed', durationS: 7200, completed: true },
      { ...at('2026-10-01T03:00:00Z'), userId: 'b', source: 'featured', durationS: 7200, completed: true },
    ];
    const fresh = computeStats({ game, plays, ratings: [], remixes: 0, now });
    expect(fresh.players).toBe(1);
    expect(fresh.avgPlayMin).toBe(60);
    const old = computeStats({ game, plays, ratings: [], remixes: 0, now: new Date('2026-10-15T00:00:00Z') });
    expect(old.rankScore / fresh.rankScore).toBeCloseTo(0.75, 5);
  });
  it('more than 30% broken among at least 5 ratings marks the game broken', () => {
    const r = (userId: string, tag: RatingRow['tag']) => ({ gameId: 'g', userId, tag, score: null, createdAt: '', updatedAt: '' });
    const four = [r('a', 'broken'), r('b', 'broken'), r('c', 'fun'), r('d', 'fun')];
    expect(computeStats({ game, plays: [], ratings: four, remixes: 0, now }).broken).toBe(false);
    expect(computeStats({ game, plays: [], ratings: [...four, r('e', 'fun')], remixes: 0, now }).broken).toBe(true);
  });
});

describe('FileStore community', () => {
  it('keeps one rating per player and leaves unlisted or failed games out of the feed', async () => {
    const { store, gameId, versionId } = await storeWithGame();
    await store.recordPlay({ ...play(versionId, 'p1', 120, { completed: true }), gameId });
    await store.rateGame(gameId, 'p1', { tag: 'fun' });
    await store.rateGame(gameId, 'p1', { tag: 'confusing', score: 2 });
    expect((await store.getRating(gameId, 'p1'))?.tag).toBe('confusing');
    expect((await store.gameStats(gameId)).ratingCount).toBe(1);
    expect(await store.listFeed()).toHaveLength(0);
    const listed = await store.setListed(gameId, true);
    expect(listed).toMatchObject({ visibility: 'listed', state: 'published' });
    const feed = await store.listFeed();
    expect(feed.map((f) => f.game.id)).toEqual([gameId]);
    expect(feed[0]!.stats.players).toBe(1);
    const failed = await storeWithGame({ playtestPassed: false });
    await expect(failed.store.setListed(failed.gameId, true)).rejects.toThrow(/playtest passed/);
  });

  it('runs a rewarded test round and keeps a broken verdict out of the feed', async () => {
    const { store, gameId, versionId } = await storeWithGame();
    const q = await store.enqueueTest({ gameId, versionId, requestedBy: 'owner', needed: 2, rewardCredits: 5 });
    expect((await store.enqueueTest({ gameId, versionId, requestedBy: 'owner' })).id).toBe(q.id);
    expect(await store.claimTest('owner')).toBeNull();
    for (const [tester, verdict] of [['t1', 'works'], ['t2', 'broken']] as const) {
      const claim = await store.claimTest(tester);
      expect(claim?.queue.id).toBe(q.id);
      expect((await store.claimTest(tester))?.assignment.id).toBe(claim!.assignment.id);
      await expect(store.submitTest(claim!.assignment.id, tester, { verdict, tag: 'fun', note: '' })).rejects.toThrow(/at least 30 s/);
      await store.recordPlay({ ...play(versionId, tester, 45, { source: 'test' }), gameId });
      const done = await store.submitTest(claim!.assignment.id, tester, { verdict, tag: 'fun', note: 'ok' });
      expect(done.assignment.rewardPaid).toBe(5);
      expect(await store.creditBalance(tester)).toBe(5);
    }
    const tests = await store.listTests(gameId);
    expect(tests.queue[0]).toMatchObject({ status: 'closed', outcome: 'broken' });
    expect((await store.getGame(gameId))?.listing['tested']).toMatchObject({ outcome: 'broken' });
    expect((await store.gameStats(gameId)).broken).toBe(true);
    await expect(store.setListed(gameId, true)).rejects.toThrow(/reported this version broken/);
    expect(await store.claimTest('t3')).toBeNull();
  });
});
