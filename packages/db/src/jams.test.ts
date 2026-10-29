import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JamInput } from '@gg/schemas';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { FileStore } from './file-store';
import { JAM, jamPhase, rankJam } from './ranking';
import type { JamEntryRow, JamVoteRow } from './types';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
afterEach(() => {
  vi.useRealTimers();
});

function fileStore(): FileStore {
  const dir = mkdtempSync(join(tmpdir(), 'gg-jams-'));
  dirs.push(dir);
  return new FileStore(dir);
}

/** A game with an accepted head whose playtest passed, published to the feed. */
async function listedGame(store: FileStore, owner: string, slug: string, genre = 'platformer') {
  const g = await store.createGame({ ownerId: owner, slug, title: slug, genre });
  const v = await store.insertVersion({ gameId: g.id, kind: 'stage', stage: 'publish', parentVersionId: null, jobId: null, sourcePath: `checkpoints/${slug}.tgz`, bundlePath: `bundles/g/${g.id}/v/1`, manifest: null, design: { evidence: { playtest: { passed: true } } }, gateResults: {}, evidence: {}, engineVersion: null, contentHash: null, costUsd: 0, policyVersion: null });
  await store.acceptVersion(v.id);
  await store.setListed(g.id, true);
  return { game: (await store.getGame(g.id))!, versionId: v.id };
}

const jamInput = (over: Partial<JamInput> = {}): JamInput => ({ slug: 'tiny-worlds', title: 'Tiny Worlds', theme: 'small spaces', description: '', genres: [], startsAt: '2026-11-01T00:00:00Z', submissionsClose: '2026-11-03T00:00:00Z', votingClose: '2026-11-05T00:00:00Z', ...over });
const play = (store: FileStore, gameId: string, versionId: string, userId: string, durationS: number, source: 'feed' | 'workspace' | 'featured' = 'feed') => store.recordPlay({ gameId, versionId, userId, source, durationS, completed: false, levelsCompleted: 0, deaths: 0 });

describe('FileStore jams', () => {
  it('runs a jam from entries through play-gated votes to ranked results', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-31T12:00:00Z') });
    const store = fileStore();
    await expect(store.createJam('maker', jamInput())).rejects.toThrow(/only moderators/);
    const jam = await store.createJam('moderator', jamInput());
    expect(jamPhase(jam)).toBe('upcoming');
    await expect(store.createJam('moderator', jamInput())).rejects.toThrow(/exists/);
    await expect(store.createJam('moderator', jamInput({ slug: 'bad-order', votingClose: '2026-11-02T00:00:00Z' }))).rejects.toThrow(/in that order/);
    const puzzleJam = await store.createJam('moderator', jamInput({ slug: 'push-it', genres: ['puzzle'] }));
    const old = await listedGame(store, 'maker', 'old-game');
    await expect(store.submitToJam(jam.id, old.game.id, 'maker')).rejects.toThrow(/has not started/);

    // Submissions open.
    vi.setSystemTime(new Date('2026-11-01T06:00:00Z'));
    await expect(store.submitToJam(jam.id, old.game.id, 'maker')).rejects.toThrow(/made after the jam started/);
    const remix = await store.forkGame(old.versionId, { ownerId: 'remixer', slug: 'old-remix', title: 'Old remix' });
    await store.setListed(remix.id, true);
    await expect(store.submitToJam(jam.id, remix.id, 'remixer')).rejects.toThrow(/its original too/);
    const mine = await listedGame(store, 'maker', 'tiny-cave');
    const draft = await store.createGame({ ownerId: 'maker', slug: 'draft', title: 'Draft', genre: 'platformer' });
    await expect(store.submitToJam(jam.id, draft.id, 'maker')).rejects.toThrow(/publish the game/);
    await expect(store.submitToJam(puzzleJam.id, mine.game.id, 'maker')).rejects.toThrow(/takes puzzle games/);
    await expect(store.submitToJam(jam.id, mine.game.id, 'player')).rejects.toThrow(/game not found/);
    const entry = await store.submitToJam(jam.slug, mine.game.id, 'maker');
    expect(entry).toMatchObject({ jamId: jam.id, gameId: mine.game.id, ownerId: 'maker', versionId: mine.versionId });
    const second = await listedGame(store, 'maker', 'tiny-sky');
    await expect(store.submitToJam(jam.id, second.game.id, 'maker')).rejects.toThrow(/already entered another game/);
    await expect(store.withdrawFromJam(jam.id, mine.game.id, 'player')).rejects.toThrow(/not your entry/);
    await store.withdrawFromJam(jam.id, mine.game.id, 'maker');
    expect(await store.listJamEntries(jam.id)).toEqual([]);
    await store.submitToJam(jam.id, mine.game.id, 'maker');
    const rival = await listedGame(store, 'rival', 'small-rooms');
    await store.submitToJam(jam.id, rival.game.id, 'rival');
    const third = await listedGame(store, 'third', 'pocket');
    await store.submitToJam(jam.id, third.game.id, 'third');
    await expect(store.voteInJam(jam.id, mine.game.id, 'v1', { fun: 5, theme: 5, look: 5 })).rejects.toThrow(/voting opens when submissions close/);

    // Voting: a vote needs a 30 s play of the entered version, never the voter's own entry.
    vi.setSystemTime(new Date('2026-11-03T06:00:00Z'));
    await expect(store.submitToJam(jam.id, second.game.id, 'maker')).rejects.toThrow(/submissions are closed/);
    await expect(store.voteInJam(jam.id, mine.game.id, 'v1', { fun: 5, theme: 4, look: 4 })).rejects.toThrow(/play the entry for 30 seconds/);
    await play(store, mine.game.id, mine.versionId, 'v1', JAM.votePlayS - 1);
    await play(store, mine.game.id, mine.versionId, 'v2', 120, 'workspace');
    await expect(store.voteInJam(jam.id, mine.game.id, 'v1', { fun: 5, theme: 4, look: 4 })).rejects.toThrow(/play the entry/);
    await expect(store.voteInJam(jam.id, mine.game.id, 'v2', { fun: 5, theme: 4, look: 4 })).rejects.toThrow(/play the entry/);
    await expect(store.voteInJam(jam.id, mine.game.id, 'maker', { fun: 5, theme: 5, look: 5 })).rejects.toThrow(/your own entry/);
    for (const voter of ['v1', 'v2', 'rival']) await play(store, mine.game.id, mine.versionId, voter, 45, 'featured');
    for (const voter of ['v1', 'v2', 'maker']) await play(store, rival.game.id, rival.versionId, voter, 45);
    await play(store, third.game.id, third.versionId, 'v1', 45);
    await store.voteInJam(jam.id, mine.game.id, 'v1', { fun: 1, theme: 1, look: 1 });
    await store.voteInJam(jam.id, mine.game.id, 'v1', { fun: 5, theme: 4, look: 4 });
    await store.voteInJam(jam.id, mine.game.id, 'v2', { fun: 4, theme: 4, look: 5 });
    await store.voteInJam(jam.id, mine.game.id, 'rival', { fun: 5, theme: 5, look: 3 });
    await store.voteInJam(jam.id, rival.game.id, 'v1', { fun: 3, theme: 3, look: 4 });
    await store.voteInJam(jam.id, rival.game.id, 'v2', { fun: 4, theme: 2, look: 3 });
    await store.voteInJam(jam.id, rival.game.id, 'maker', { fun: 3, theme: 4, look: 3 });
    await store.voteInJam(jam.id, third.game.id, 'v1', { fun: 5, theme: 5, look: 5 });
    expect((await store.listJamVotes(jam.id, 'v1')).map((v) => [v.gameId, v.fun])).toEqual([
      [mine.game.id, 5],
      [rival.game.id, 3],
      [third.game.id, 5],
    ]);
    await expect(store.jamResults(jam.id)).rejects.toThrow(/when voting closes/);

    // Closed: three votes rank; one vote of all fives stays unranked.
    vi.setSystemTime(new Date('2026-11-05T06:00:00Z'));
    await expect(store.voteInJam(jam.id, third.game.id, 'v2', { fun: 5, theme: 5, look: 5 })).rejects.toThrow(/voting is closed/);
    const results = await store.jamResults(jam.id);
    const shrunk = (sum: number, n: number) => (sum + JAM.priorScore * JAM.priorVotes) / (n + JAM.priorVotes);
    expect(results.map((r) => [r.gameId, r.rank, r.votes])).toEqual([
      [mine.game.id, 1, 3],
      [rival.game.id, 2, 3],
      [third.game.id, null, 1],
    ]);
    expect(results[0]).toMatchObject({ fun: 4.666667, theme: 4.333333, look: 4 });
    expect(results[0]!.score).toBeCloseTo((shrunk(14, 3) + shrunk(13, 3) + shrunk(12, 3)) / 3, 6);
    expect(results[2]!.score).toBeCloseTo(shrunk(5, 1), 6);

    // A game taken out of the feed leaves the jam; moderators move the moments, in order only.
    await store.setListed(rival.game.id, false);
    expect((await store.jamResults(jam.id)).map((r) => r.gameId)).toEqual([mine.game.id, third.game.id]);
    expect((await store.listJamEntries(jam.id)).map((e) => e.gameId)).toEqual([mine.game.id, third.game.id]);
    await expect(store.setJamSchedule(jam.id, 'maker', { votingClose: '2026-11-09T00:00:00Z' })).rejects.toThrow(/only moderators/);
    await expect(store.setJamSchedule(jam.id, 'moderator', { votingClose: '2026-11-02T00:00:00Z' })).rejects.toThrow(/in that order/);
    expect(jamPhase(await store.setJamSchedule(jam.id, 'moderator', { votingClose: '2026-11-09T00:00:00Z' }))).toBe('voting');
    expect((await store.listJams()).map((j) => j.slug).sort()).toEqual(['push-it', 'tiny-worlds']);
    expect((await store.getJam('tiny-worlds'))?.id).toBe(jam.id);
  });
});

describe('rankJam', () => {
  const entry = (gameId: string, submittedAt: string): JamEntryRow => ({ jamId: 'j', gameId, ownerId: `o-${gameId}`, versionId: `v-${gameId}`, submittedAt });
  const vote = (gameId: string, voterId: string, fun: number, theme: number, look: number): JamVoteRow => ({ jamId: 'j', gameId, voterId, fun, theme, look, createdAt: '', updatedAt: '' });

  it('the prior keeps a few top votes from beating many good ones; ties go to votes, then to who entered first', () => {
    const fives = Array.from({ length: 3 }, (_, i) => vote('a', `u${i}`, 5, 5, 5));
    const fours = Array.from({ length: 12 }, (_, i) => vote('b', `u${i}`, 5, 5, 4));
    const r = rankJam([entry('a', '2026-11-01'), entry('b', '2026-11-02')], [...fives, ...fours]);
    expect(r.map((x) => x.gameId)).toEqual(['b', 'a']);
    const tie = rankJam([entry('late', '2026-11-02'), entry('early', '2026-11-01')], [...['x', 'y', 'z'].map((u) => vote('late', u, 4, 4, 4)), ...['x', 'y', 'z'].map((u) => vote('early', u, 4, 4, 4))]);
    expect(tie.map((x) => [x.gameId, x.rank])).toEqual([
      ['early', 1],
      ['late', 2],
    ]);
    expect(rankJam([entry('none', '2026-11-01')], [])[0]).toMatchObject({ votes: 0, fun: null, rank: null, score: JAM.priorScore });
  });
});
