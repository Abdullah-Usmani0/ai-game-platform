import { jamPhase, type JamPhase, type JamResult, type JamRow, type Store } from '@gg/db';

export interface JamEntryView {
  gameId: string;
  title: string;
  genre: string;
  ownerId: string;
  versionId: string;
  submittedAt: string;
  /** The entered version, as jam traffic (recorded as featured, so it never ranks in the feed). */
  playUrl: string;
  mine: boolean;
  myVote: { fun: number; theme: number; look: number } | null;
}

export interface JamView {
  jam: JamRow;
  phase: JamPhase;
  entries: JamEntryView[];
  /** Once voting closed. */
  results: Array<JamResult & { title: string; playUrl: string }> | null;
  viewer: { id: string; moderator: boolean; entryGameId: string | null; eligible: Array<{ id: string; title: string }> };
}

const playUrl = (gameId: string, versionId: string) => `/play/${gameId}?version=${versionId}&src=featured`;

/** Everything the jam page shows for one viewer: entries with their own votes, their games that could enter, results. */
export async function jamView(store: Store, jam: JamRow, viewer: string): Promise<JamView> {
  const phase = jamPhase(jam);
  const [entries, votes, moderator, own] = await Promise.all([store.listJamEntries(jam.id), store.listJamVotes(jam.id, viewer), store.isModerator(viewer), store.listGames({ ownerId: viewer, limit: 200 })]);
  const games = new Map((await Promise.all(entries.map((e) => store.getGame(e.gameId)))).flatMap((g) => (g ? [[g.id, g] as const] : [])));
  const entryViews = entries.map((e): JamEntryView => {
    const g = games.get(e.gameId);
    const v = votes.find((x) => x.gameId === e.gameId);
    return { gameId: e.gameId, title: g?.title ?? e.gameId, genre: g?.genre ?? '', ownerId: e.ownerId, versionId: e.versionId, submittedAt: e.submittedAt, playUrl: playUrl(e.gameId, e.versionId), mine: e.ownerId === viewer, myVote: v ? { fun: v.fun, theme: v.theme, look: v.look } : null };
  });
  const results = phase === 'closed' ? (await store.jamResults(jam.id)).map((r) => ({ ...r, title: games.get(r.gameId)?.title ?? r.gameId, playUrl: playUrl(r.gameId, r.versionId) })) : null;
  // What the store will accept is decided there; this only offers the games worth trying.
  const eligible = own
    .filter((g) => g.visibility === 'listed' && (g.state === 'playable' || g.state === 'published') && Date.parse(g.createdAt) >= Date.parse(jam.startsAt) && (jam.genres.length === 0 || jam.genres.includes(g.genre)))
    .map((g) => ({ id: g.id, title: g.title }));
  return { jam, phase, entries: entryViews, results, viewer: { id: viewer, moderator, entryGameId: entryViews.find((e) => e.mine)?.gameId ?? null, eligible } };
}

/** Store rule violations are user-facing: moderator-only actions are 403, the rest a conflict with the jam's rules. */
export function jamErrorStatus(message: string): number {
  return /only moderators/.test(message) ? 403 : /not found/.test(message) ? 404 : 409;
}
