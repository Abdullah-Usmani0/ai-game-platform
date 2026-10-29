import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FileStore } from './file-store';
import { computeStats, quarantinePath, RANKING } from './ranking';
import type { GameRow, PlayRow, RatingRow } from './types';

/** The file store follows the same community rules as 0003_community.sql (see migrations.test.ts for the SQL side). */
async function storeWithGame(opts: { playtestPassed?: boolean } = {}) {
  const store = new FileStore(mkdtempSync(join(tmpdir(), 'gg-community-')));
  const game = await store.createGame({ ownerId: 'owner', slug: 'g-one', title: 'One', genre: 'platformer' });
  const v = await store.insertVersion({ gameId: game.id, kind: 'stage', stage: 'publish', parentVersionId: null, jobId: null, sourcePath: 'checkpoints/x.tgz', bundlePath: `bundles/g/${game.id}/v/1`, manifest: null, design: { evidence: { playtest: { passed: opts.playtestPassed ?? true } } }, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: 1 });
  await store.acceptVersion(v.id);
  return { store, gameId: game.id, versionId: v.id };
}
const newVersion = (gameId: string) => ({ gameId, kind: 'stage' as const, stage: 'publish', parentVersionId: null, jobId: null, sourcePath: 'checkpoints/n.tgz', bundlePath: `bundles/g/${gameId}/v/n`, manifest: null, design: { evidence: { playtest: { passed: true } } }, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: 1 });
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

describe('FileStore moderation', () => {
  const abuse = { kind: 'abuse' as const, note: 'slurs on the title screen', rightsHolder: false };

  it('suspends on three players\' reports, comes back when a moderator dismisses one, and strikes on warn', async () => {
    const { store, gameId, versionId } = await storeWithGame();
    await store.setListed(gameId, true);
    await store.enqueueTest({ gameId, versionId, requestedBy: 'owner', needed: 1 });
    await expect(store.reportGame(gameId, 'owner', abuse)).rejects.toThrow(/your own game/);
    const first = await store.reportGame(gameId, 'p1', abuse);
    expect((await store.reportGame(gameId, 'p1', { ...abuse, note: 'again' })).report.id).toBe(first.report.id);
    expect((await store.reportGame(gameId, 'p2', abuse)).suspended).toBe(false);
    // A broken report counts towards suspension; an "other" report does not.
    await store.reportGame(gameId, 'p4', { kind: 'other', note: '', rightsHolder: false });
    expect((await store.reportGame(gameId, 'p3', { kind: 'broken', note: '', rightsHolder: false })).suspended).toBe(true);
    expect((await store.getGame(gameId))?.state).toBe('suspended');
    expect(await store.listFeed()).toHaveLength(0);
    await expect(store.setListed(gameId, true)).rejects.toThrow(/suspended/);
    await expect(store.forkGame((await store.getGame(gameId))!.headVersionId!, { ownerId: 'p9', slug: 'copy', title: 'Copy' })).rejects.toThrow(/cannot be remixed/);
    // The open test round waits: testers are not handed a suspended game, and the owner cannot ask for more.
    expect(await store.claimTest('t9')).toBeNull();
    await expect(store.enqueueTest({ gameId, versionId, requestedBy: 'owner' })).rejects.toThrow(/testers cannot be asked/);
    await expect(store.resolveReport(first.report.id, 'p5', { resolution: 'dismiss', note: '' })).rejects.toThrow(/only moderators/);
    await expect(store.resolveReport(first.report.id, 'moderator', { resolution: 'license', note: '' })).rejects.toThrow(/only ip reports/);
    const broken = (await store.listReports({ gameId, status: 'open' })).find((r) => r.kind === 'broken')!;
    await expect(store.resolveReport(broken.id, 'moderator', { resolution: 'warn', note: '' })).rejects.toThrow(/not misconduct/);
    const warned = await store.resolveReport(first.report.id, 'moderator', { resolution: 'warn', note: 'first warning' });
    expect(warned.report).toMatchObject({ status: 'resolved', resolution: 'warn', resolvedBy: 'moderator', resolutionNote: 'first warning' });
    expect(warned.game.state).toBe('published');
    expect(await store.activeStrikes('owner')).toBe(1);
    expect((await store.listFeed()).map((f) => f.game.id)).toEqual([gameId]);
    expect((await store.claimTest('t9'))?.queue.gameId).toBe(gameId);
    await expect(store.resolveReport(first.report.id, 'moderator', { resolution: 'dismiss', note: '' })).rejects.toThrow(/already resolved/);
    expect(await store.listReports({ gameId, status: 'open' })).toHaveLength(3);
  });

  it('unlists a confirmed broken game without a strike until a new version is accepted', async () => {
    const { store, gameId, versionId } = await storeWithGame();
    await store.setListed(gameId, true);
    const a = await store.reportGame(gameId, 'p1', { kind: 'broken', note: 'falls through the floor', rightsHolder: false });
    await store.reportGame(gameId, 'p2', { kind: 'broken', note: '', rightsHolder: false });
    const { game } = await store.resolveReport(a.report.id, 'moderator', { resolution: 'unlist', note: 'confirmed: level 2 floor' });
    expect(game).toMatchObject({ state: 'playable', visibility: 'unlisted' });
    expect(await store.listReports({ gameId, status: 'open' })).toHaveLength(0);
    expect(await store.activeStrikes('owner')).toBe(0);
    await expect(store.setListed(gameId, true)).rejects.toThrow(/moderator unlisted this version/);
    const fixed = await store.insertVersion({ gameId, kind: 'stage', stage: 'publish', parentVersionId: versionId, jobId: null, sourcePath: 'checkpoints/y.tgz', bundlePath: `bundles/g/${gameId}/v/2`, manifest: null, design: { evidence: { playtest: { passed: true } } }, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: 1 });
    await store.acceptVersion(fixed.id);
    expect(await store.setListed(gameId, true)).toMatchObject({ state: 'published', visibility: 'listed' });
    await store.acceptVersion((await store.insertVersion({ ...newVersion(gameId), parentVersionId: fixed.id })).id);
    expect(await store.getGame(gameId)).toMatchObject({ state: 'published', visibility: 'listed' });
  });

  it('removes a game with its unedited remixes and bundle files, records takedowns, and blocks listing at three strikes', async () => {
    const { store, gameId, versionId } = await storeWithGame();
    await store.putObject('bundles', `g/${gameId}/v/1/index.html`, new TextEncoder().encode('<!doctype html>'), 'text/html');
    const copy = await store.forkGame(versionId, { ownerId: 'fan', slug: 'g-one-remix', title: 'One (remix)' });
    const edited = await store.forkGame(versionId, { ownerId: 'fan2', slug: 'g-one-remix-2', title: 'One (edited)' });
    const own = await store.insertVersion({ gameId: edited.id, kind: 'stage', stage: 'publish', parentVersionId: edited.headVersionId, jobId: null, sourcePath: 'checkpoints/z.tgz', bundlePath: `bundles/g/${edited.id}/v/2`, manifest: null, design: { evidence: { playtest: { passed: true } } }, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: 1 });
    await store.acceptVersion(own.id);
    const ip = await store.reportGame(gameId, 'rights-holder', { kind: 'ip', note: 'my character', rightsHolder: true });
    await store.reportGame(gameId, 'p2', { kind: 'broken', note: '', rightsHolder: false });
    const onCopy = await store.reportGame(copy.id, 'p3', { kind: 'ip', note: 'same sprites', rightsHolder: false });
    const { game } = await store.resolveReport(ip.report.id, 'moderator', { resolution: 'remove', note: 'DMCA notice 42' });
    expect(game).toMatchObject({ state: 'removed', visibility: 'unlisted' });
    expect((await store.getGame(copy.id))?.state).toBe('removed');
    expect((await store.getGame(edited.id))?.state).toBe('playable');
    expect((await store.listTakedowns(gameId)).map((t) => [t.action, t.terms])).toEqual([['removed', 'DMCA notice 42']]);
    expect(await store.listTakedowns(copy.id)).toHaveLength(1);
    expect((await store.listReports({ gameId: copy.id }))[0]).toMatchObject({ id: onCopy.report.id, status: 'resolved', resolution: 'remove' });
    await expect(store.reportGame(gameId, 'p4', { kind: 'abuse', note: '', rightsHolder: false })).rejects.toThrow(/already removed/);
    expect(existsSync(store.objectPath('bundles', `g/${gameId}/v/1/index.html`))).toBe(false);
    expect((await store.listReports({ gameId })).every((r) => r.status === 'resolved' && r.resolution === 'remove')).toBe(true);
    expect(await store.activeStrikes('owner')).toBe(1);
    expect(await store.activeStrikes('fan')).toBe(0);
    await expect(store.setListed(gameId, true)).rejects.toThrow(/removed/);
    // A job queued before the takedown cannot bring the game back by accepting a version.
    await store.acceptVersion((await store.insertVersion(newVersion(gameId))).id);
    expect((await store.getGame(gameId))?.state).toBe('removed');

    const licensed = await storeWithGame();
    const claim = await licensed.store.reportGame(licensed.gameId, 'rights-holder', { kind: 'ip', note: '', rightsHolder: true });
    await licensed.store.resolveReport(claim.report.id, 'moderator', { resolution: 'license', note: 'licensed for 12 months' });
    expect((await licensed.store.getGame(licensed.gameId))?.listing['license']).toMatchObject({ terms: 'licensed for 12 months' });
    expect((await licensed.store.listTakedowns(licensed.gameId))[0]?.action).toBe('licensed');
    expect(await licensed.store.activeStrikes('owner')).toBe(0);
    for (const reporter of ['p1', 'p2', 'p3']) {
      const r = await licensed.store.reportGame(licensed.gameId, reporter, { kind: 'other', note: 'spam', rightsHolder: false });
      await licensed.store.resolveReport(r.report.id, 'moderator', { resolution: 'warn', note: '' });
    }
    await expect(licensed.store.setListed(licensed.gameId, true)).rejects.toThrow(/3 active strikes/);
    expect(await licensed.store.isModerator('moderator')).toBe(true);
    expect(await licensed.store.isModerator('owner')).toBe(false);
  });
});

describe('FileStore heatmap', () => {
  const ev = (kind: 'death' | 'quit' | 'sample', level: string, x: number, y: number, t = 1) => ({ kind, level, x, y, t });

  it("counts other players' deaths, quits and samples per level and cell, with the plays that reached each level", async () => {
    const { store, gameId, versionId } = await storeWithGame();
    await store.recordPlay({ ...play(versionId, 'p1', 60), gameId }, [ev('sample', 'L01', 10, 20), ev('death', 'L01', 33, 47), ev('death', 'L01', 40, 40), ev('sample', 'L02', 5, 5), ev('quit', 'L02', 7, 9)]);
    await store.recordPlay({ ...play(versionId, 'p2', 30), gameId }, [ev('death', 'L01', 35, 33), ev('death', 'L01', 100, 0)]);
    // The owner's own play is left out.
    await store.recordPlay({ ...play(versionId, 'owner', 30), gameId }, [ev('death', 'L01', 35, 33), ev('sample', 'L03', 0, 0)]);
    const heat = await store.playHeatmap(gameId, versionId, 16);
    expect(heat).toMatchObject({ versionId, cell: 16 });
    expect(Object.keys(heat.levels).sort()).toEqual(['L01', 'L02']);
    expect(heat.levels['L01']).toEqual({ plays: 2, death: [{ x: 2, y: 2, n: 3 }, { x: 6, y: 0, n: 1 }], quit: [], sample: [{ x: 0, y: 1, n: 1 }] });
    expect(heat.levels['L02']).toEqual({ plays: 1, death: [], quit: [{ x: 0, y: 0, n: 1 }], sample: [{ x: 0, y: 0, n: 1 }] });
    expect((await store.playHeatmap(gameId, versionId, 32)).levels['L01']?.death).toEqual([{ x: 1, y: 1, n: 3 }, { x: 3, y: 0, n: 1 }]);
    expect((await store.playHeatmap(gameId, 'another-version')).levels).toEqual({});
    await expect(store.playHeatmap(gameId, versionId, 0)).rejects.toThrow(/cell must be/);
    await expect(store.recordPlay({ ...play(versionId, 'p3', 30), gameId }, Array.from({ length: 602 }, () => ev('sample', 'L01', 0, 0)))).rejects.toThrow(/at most 601/);
  });
});

describe('FileStore appeals', () => {
  const statement = 'This board is my own work; the sprites were drawn by me in 2026.';
  const contact = { statement, name: 'Owner', email: 'owner@example.com' };

  it('quarantines a removed game, waits 14 days on a counter-notice, then restores it, its remix, its files and the strike', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T00:00:00Z') });
    try {
      const { store, gameId, versionId } = await storeWithGame();
      await store.putObject('bundles', `g/${gameId}/v/1/index.html`, new TextEncoder().encode('<!doctype html>'), 'text/html');
      const copy = await store.forkGame(versionId, { ownerId: 'fan', slug: 'g-one-copy', title: 'Copy' });
      const ip = await store.reportGame(gameId, 'rights-holder', { kind: 'ip', note: 'my sprites', rightsHolder: true });
      await store.resolveReport(ip.report.id, 'moderator', { resolution: 'remove', note: 'DMCA notice 45' });
      const live = store.objectPath('bundles', `g/${gameId}/v/1/index.html`);
      const held = store.objectPath('checkpoints', `${quarantinePath(ip.report.id, gameId)}/v/1/index.html`);
      expect([existsSync(live), existsSync(held)]).toEqual([false, true]);
      expect(await store.activeStrikes('owner')).toBe(1);
      await expect(store.appealTakedown(gameId, 'owner', { ...contact, consent: false })).rejects.toThrow(/consent/);
      await expect(store.appealTakedown(gameId, 'fan', { ...contact, consent: true })).rejects.toThrow(/not found/);
      const appeal = await store.appealTakedown(gameId, 'owner', { ...contact, consent: true });
      expect(appeal).toMatchObject({ status: 'open', reinstateAfter: '2026-11-15T00:00:00.000Z' });
      await expect(store.appealTakedown(gameId, 'owner', { ...contact, consent: true })).rejects.toThrow(/already appealed/);
      await expect(store.decideAppeal(appeal.id, 'owner', { decision: 'reinstate', note: '' })).rejects.toThrow(/only moderators/);
      await expect(store.decideAppeal(appeal.id, 'moderator', { decision: 'reinstate', note: '' })).rejects.toThrow(/waits 14 days/);
      vi.setSystemTime(new Date('2026-11-15T00:00:01Z'));
      const { appeal: decided, games } = await store.decideAppeal(appeal.id, 'moderator', { decision: 'reinstate', note: 'no court action' });
      expect(decided).toMatchObject({ status: 'reinstated', decidedBy: 'moderator', decisionNote: 'no court action' });
      expect(games.map((g) => [g.id, g.state, g.visibility]).sort()).toEqual([[copy.id, 'playable', 'unlisted'], [gameId, 'playable', 'unlisted']].sort());
      expect([existsSync(live), existsSync(held)]).toEqual([true, false]);
      expect(await store.activeStrikes('owner')).toBe(0);
      expect((await store.listTakedowns(gameId))[0]?.revertedAt).toBe('2026-11-15T00:00:01.000Z');
      await expect(store.decideAppeal(appeal.id, 'moderator', { decision: 'uphold', note: '' })).rejects.toThrow(/already decided/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a plain appeal of an abuse removal is decided at once; upholding keeps the game down', async () => {
    const { store, gameId } = await storeWithGame();
    const r = await store.reportGame(gameId, 'p1', { kind: 'abuse', note: '', rightsHolder: false });
    await store.resolveReport(r.report.id, 'moderator', { resolution: 'remove', note: '' });
    const appeal = await store.appealTakedown(gameId, 'owner', { ...contact, consent: false });
    expect(Date.parse(appeal.reinstateAfter)).toBeLessThanOrEqual(Date.now());
    const { appeal: upheld, games } = await store.decideAppeal(appeal.id, 'moderator', { decision: 'uphold', note: 'it is abusive' });
    expect([upheld.status, games.length, (await store.getGame(gameId))?.state]).toEqual(['upheld', 0, 'removed']);
    expect(await store.listAppeals({ status: 'open' })).toHaveLength(0);
    await expect(store.appealTakedown(gameId, 'owner', { ...contact, consent: false })).rejects.toThrow(/already appealed/);
  });
});
