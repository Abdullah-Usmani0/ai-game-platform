import { SaveBlob, type LevelJson, type ParamValue } from '@gg/schemas';
import type { ProgressSave } from '../sim/sim.js';

/** Where a game picks up from a save its host gave back: the level by its place, the save in it, what the level began with. */
export interface SaveStart {
  level: number;
  save: ProgressSave;
  carry: Record<string, ParamValue>;
}

/**
 * The blob a game leaves with its host when the player rests (the bridge's save message): the level, the save in it,
 * and the props the level began with. Null when what the rest announced is no save, or the blob would not fit the
 * host's limit (in bytes).
 */
export function saveBlob(level: number, levelId: string, save: unknown, carry: Readonly<Record<string, ParamValue>>, limit: number): string | null {
  const parsed = SaveBlob.safeParse({ v: 1, level, levelId, save, carry });
  if (!parsed.success) return null;
  const blob = JSON.stringify(parsed.data);
  return new TextEncoder().encode(blob).length <= limit ? blob : null;
}

/**
 * Where a blob the host gave back picks the game up, or null when it is none of this game's saves: not a save at all, a
 * level the game does not have (another version's), or places outside the level.
 */
export function readSaveBlob(blob: string | undefined, levels: readonly LevelJson[]): SaveStart | null {
  if (!blob) return null;
  let json: unknown;
  try {
    json = JSON.parse(blob);
  } catch {
    return null;
  }
  const parsed = SaveBlob.safeParse(json);
  if (!parsed.success) return null;
  const { level, levelId, save, carry } = parsed.data;
  const l = levels[level];
  if (!l || l.id !== levelId) return null;
  if (save.removed.some((i) => i >= l.entities.length) || save.tiles.some(([x, y]) => x >= l.width || y >= l.height)) return null;
  return { level, save, carry };
}
