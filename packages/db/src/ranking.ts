import type { RatingTag } from '@gg/schemas';
import type { GameRow, GameStats, PlayRow, RatingRow, VersionRow } from './types';

/**
 * The ranking contract. supabase/migrations/0003_community.sql implements the same formula in SQL (refresh_game_stats)
 * and the migration test checks both give the same scores on the same rows.
 *
 * Signals are averaged per player, not per play, so one player cannot inflate a game: a player's minutes count at
 * most 60 per UTC day, a player qualifies with one play of 30 s, and completion is whether a qualified player ever
 * finished. Plays by the owner and from featured, search, test or workspace traffic are left out.
 *
 *   engagement = (Q * (0.5 * completion + 0.5 * min(avgMinutes / 10, 1)) + 3 * 0.3) / (Q + 3)      Q = qualified players
 *   quality    = clamp01((fun + 2 - 2 * broken - 0.5 * confusing - 0.5 * ugly) / (ratings + 4))
 *   rank       = (0.6 * engagement + 0.4 * quality + min(0.1, 0.025 * log2(1 + remixes))) * (0.5 + 0.5 * 0.5^(ageDays / 14))
 *
 * A game is broken when at least 5 players rated it and more than 30% said broken, or its last test round said broken.
 */
export const RANKING = {
  qualifiedPlayS: 30,
  dailyCapMin: 60,
  excludedSources: ['featured', 'search', 'test', 'workspace'] as readonly string[],
  priorPlayers: 3,
  priorEngagement: 0.3,
  fullPlayMin: 10,
  priorRatings: 4,
  priorFun: 2,
  halfLifeDays: 14,
  brokenMinRatings: 5,
  brokenShare: 0.3,
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export interface StatsInputs {
  game: GameRow;
  plays: PlayRow[];
  ratings: RatingRow[];
  remixes: number;
  /** Outcome of the latest closed test round for the game, if any. */
  testOutcome?: 'works' | 'broken' | null;
  now?: Date;
}

export function computeStats({ game, plays, ratings, remixes, testOutcome = null, now = new Date() }: StatsInputs): GameStats {
  const counted = plays.filter((p) => p.gameId === game.id && p.userId !== game.ownerId && !RANKING.excludedSources.includes(p.source));
  const perUser = new Map<string, { minutesByDay: Map<string, number>; qualified: boolean; completed: boolean }>();
  for (const p of counted) {
    const u = perUser.get(p.userId) ?? { minutesByDay: new Map<string, number>(), qualified: false, completed: false };
    const day = new Date(p.createdAt).toISOString().slice(0, 10);
    u.minutesByDay.set(day, (u.minutesByDay.get(day) ?? 0) + p.durationS / 60);
    if (p.durationS >= RANKING.qualifiedPlayS) u.qualified = true;
    if (p.completed) u.completed = true;
    perUser.set(p.userId, u);
  }
  const qualified = [...perUser.values()].filter((u) => u.qualified);
  const minutes = (u: { minutesByDay: Map<string, number> }) => [...u.minutesByDay.values()].reduce((a, m) => a + Math.min(m, RANKING.dailyCapMin), 0);
  const q = qualified.length;
  const completionRate = q ? qualified.filter((u) => u.completed).length / q : 0;
  const avgPlayMin = q ? qualified.reduce((a, u) => a + minutes(u), 0) / q : 0;
  const raw = 0.5 * completionRate + 0.5 * Math.min(avgPlayMin / RANKING.fullPlayMin, 1);
  const engagement = (q * raw + RANKING.priorPlayers * RANKING.priorEngagement) / (q + RANKING.priorPlayers);

  const rated = ratings.filter((r) => r.gameId === game.id && r.userId !== game.ownerId);
  const tags: Record<RatingTag, number> = { fun: 0, confusing: 0, broken: 0, ugly: 0 };
  for (const r of rated) tags[r.tag]++;
  const n = rated.length;
  const quality = clamp01((tags.fun + RANKING.priorFun - 2 * tags.broken - 0.5 * tags.confusing - 0.5 * tags.ugly) / (n + RANKING.priorRatings));

  const ageDays = Math.max(0, (now.getTime() - Date.parse(game.createdAt)) / 86_400_000);
  const freshness = 0.5 + 0.5 * Math.pow(0.5, ageDays / RANKING.halfLifeDays);
  const remixBonus = Math.min(0.1, 0.025 * Math.log2(1 + remixes));
  const broken = (n >= RANKING.brokenMinRatings && tags.broken / n > RANKING.brokenShare) || testOutcome === 'broken';
  return {
    gameId: game.id,
    players: perUser.size,
    qualifiedPlayers: q,
    plays: counted.length,
    completionRate: round6(completionRate),
    avgPlayMin: round6(avgPlayMin),
    ratings: tags,
    ratingCount: n,
    remixes,
    engagement: round6(engagement),
    quality: round6(quality),
    rankScore: round6((0.6 * engagement + 0.4 * quality + remixBonus) * freshness),
    broken,
    computedAt: now.toISOString(),
  };
}

/** The head version's own playtest gate passed (versions without a playtest record, such as older bundles, pass). */
export function headPlaytestPassed(head: VersionRow | null): boolean {
  if (!head?.bundlePath) return false;
  const evidence = (head.design as { evidence?: { playtest?: { passed?: boolean } | null } }).evidence;
  return evidence?.playtest?.passed !== false;
}

/** Feed rule: listed, playable, a published head that passed its playtest, and not broken. */
export function feedEligible(game: GameRow, head: VersionRow | null, stats: GameStats): boolean {
  return game.visibility === 'listed' && (game.state === 'playable' || game.state === 'published') && headPlaytestPassed(head) && !stats.broken;
}

/** Majority verdict of a closed test round; a tie counts as broken. */
export function testOutcome(verdicts: Array<'works' | 'broken'>): 'works' | 'broken' {
  const works = verdicts.filter((v) => v === 'works').length;
  return works > verdicts.length - works ? 'works' : 'broken';
}
