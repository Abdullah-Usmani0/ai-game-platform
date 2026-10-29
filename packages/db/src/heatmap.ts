import type { PlayEventKind } from '@gg/schemas';
import type { Heatmap, LevelHeat, PlayEventRow } from './types';

/** Heatmap cells in pixels: the default is a 16 px tile; callers pass the level's tile size. */
export const HEAT_CELL = { default: 16, min: 1, max: 256 } as const;

export function checkCell(cell: number): number {
  if (!Number.isInteger(cell) || cell < HEAT_CELL.min || cell > HEAT_CELL.max) throw new Error(`cell must be a whole number of pixels from ${HEAT_CELL.min} to ${HEAT_CELL.max}`);
  return cell;
}

/** One aggregated row, as play_heatmap in 0005_play_events.sql returns it. */
export interface HeatRow {
  levelId: string;
  kind: PlayEventKind;
  cx: number;
  cy: number;
  n: number;
  plays: number;
}

/**
 * Counts one version's play events per level, kind and cell (floor(px / cell)), leaving out the owner's own plays,
 * with the number of plays that reached each level. Same grouping as play_heatmap.
 */
export function heatRows(events: readonly PlayEventRow[], opts: { versionId: string; ownerId: string; cell: number }): HeatRow[] {
  const counts = new Map<string, HeatRow>();
  const plays = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.versionId !== opts.versionId || e.userId === opts.ownerId) continue;
    const cx = Math.floor(e.x / opts.cell);
    const cy = Math.floor(e.y / opts.cell);
    const key = `${e.level}\u0000${e.kind}\u0000${cx}\u0000${cy}`;
    const row = counts.get(key);
    if (row) row.n++;
    else counts.set(key, { levelId: e.level, kind: e.kind, cx, cy, n: 1, plays: 0 });
    const seen = plays.get(e.level) ?? new Set<string>();
    seen.add(e.playId);
    plays.set(e.level, seen);
  }
  return [...counts.values()].map((r) => ({ ...r, plays: plays.get(r.levelId)?.size ?? 0 }));
}

/** Rows to the heatmap the workspace draws; cells sorted busiest first, then by position, so both stores agree. */
export function heatmapFrom(rows: readonly HeatRow[], versionId: string, cell: number): Heatmap {
  const levels: Record<string, LevelHeat> = {};
  for (const r of rows) {
    const level = (levels[r.levelId] ??= { plays: r.plays, death: [], quit: [], sample: [] });
    level[r.kind].push({ x: r.cx, y: r.cy, n: r.n });
  }
  for (const level of Object.values(levels)) for (const kind of ['death', 'quit', 'sample'] as const) level[kind].sort((a, b) => b.n - a.n || a.y - b.y || a.x - b.x);
  return { versionId, cell, levels };
}
