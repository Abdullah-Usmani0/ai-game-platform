import type { ScopeTier } from '@gg/schemas';
import { DEFAULT_SEED, levelSeed } from '@gg/sdk';
import type { GenreManifest } from './manifest.js';

/** One level a game ships, as planned from its scope. */
export interface PlannedLevel {
  /** Position in the game (0 for the first level). */
  index: number;
  /** 'l01', 'l02'... or 'arena' for arena grammars. */
  id: string;
  /** Generator difficulty, 0 to 1. */
  difficulty: number;
  /** 1 on the boss floor (generators without bosses ignore it). */
  boss: number;
  /** The seed the game plays this level with by default: every proof (solver, explorer, replays) runs at it. */
  seed: number;
}

/** Arena difficulty by tier: one arena, harder waves in bigger games. */
export const ARENA_DIFFICULTY: Record<ScopeTier, number> = { small: 0.25, medium: 0.35, large: 0.45 };

/** The most levels a game ships. */
export const MAX_LEVELS = 10;

/**
 * The levels a game ships, from its GDD scope. Arena grammars build exactly one arena (their scope counts one level
 * whatever the tier). Other grammars ramp from 0.15 by at most 0.2 a level toward 0.75, a single level sits at 0.25,
 * and a scope with a boss puts it on the last of two or more levels. The scaffold's placeholders, the worker's levels
 * stage and the GDD all follow this plan, so what the design promises is what gets built.
 */
export function levelPlan(grammar: GenreManifest['levelGrammar']['kind'], scope: { levels: number; bosses: number; tier: ScopeTier }): PlannedLevel[] {
  if (grammar === 'arena') return [{ index: 0, id: 'arena', difficulty: ARENA_DIFFICULTY[scope.tier], boss: 0, seed: levelSeed(DEFAULT_SEED, 0) }];
  const count = Math.max(1, Math.min(MAX_LEVELS, Math.round(scope.levels)));
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    id: `l${String(i + 1).padStart(2, '0')}`,
    difficulty: Math.round((count === 1 ? 0.25 : 0.15 + (0.6 * i) / Math.max(3, count - 1)) * 100) / 100,
    boss: scope.bosses > 0 && count > 1 && i === count - 1 ? 1 : 0,
    seed: levelSeed(DEFAULT_SEED, i),
  }));
}

/** How many levels a grammar can ship for a scope: what a GDD may promise. */
export function plannedLevelCount(grammar: GenreManifest['levelGrammar']['kind'], levels: number): number {
  return grammar === 'arena' ? 1 : Math.max(1, Math.min(MAX_LEVELS, Math.round(levels)));
}
