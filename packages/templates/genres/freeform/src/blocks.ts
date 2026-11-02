import type { DialogueFile, FreeformSystemsJson, LevelJson, ParamValue } from '@gg/schemas';
import type { FeelPreset } from '@gg/sdk';
import type { BlockLevelCtx, BotPolicy } from '@gg/template-core';
import type { Issue } from '@gg/validators';
import type { Composed } from './compose.js';
import { BLOCKS } from './registry.js';

/** Where a level is in the game, and the game's talk: what a block places by the level (the people a story puts there). */
export interface LevelAt {
  level?: number;
  story?: DialogueFile | null;
}

/** A level's place in the game from the id it ships under ('l03' is the third; an arena is the only one), if it has one. */
export function levelIndexOf(id: string): number | undefined {
  if (id === 'arena') return 0;
  const m = /^l(\d{2})$/.exec(id);
  return m ? Number(m[1]) - 1 : undefined;
}

/**
 * What a block's level hooks know of the game: its movement and feel, its names for the block's entities, its params,
 * and where they are known, the level's place in the game and the game's talk.
 */
export function blockCtx(file: FreeformSystemsJson, composed: Composed, blockId: string, feel: FeelPreset, at: LevelAt = {}): BlockLevelCtx {
  const meta = BLOCKS[blockId]!.meta;
  const params: Record<string, ParamValue> = Object.fromEntries(Object.entries(meta.params).map(([k, p]) => [k, p.default]));
  Object.assign(params, file.systems.find((s) => s.id === blockId)?.params, composed.runtime.composedParams?.[blockId]);
  return {
    movementMode: composed.runtime.movementMode,
    feel,
    typeOf: (t) => composed.roster.typeOf.get(`${blockId}:${t}`) ?? t,
    defOf: (type) => composed.runtime.entityDefs.find((d) => d.type === type),
    params,
    level: at.level,
    story: at.story ?? null,
  };
}

/** The game's blocks, in its systems.json order. */
const blocksOf = (file: FreeformSystemsJson) => file.systems.map((s) => s.id).filter((id) => BLOCKS[id]);

/** The game's names for the entities its blocks bring (a courier's cargo and stations). */
export function blockTypes(file: FreeformSystemsJson, composed: Composed): Set<string> {
  const out = new Set<string>();
  for (const id of blocksOf(file)) for (const a of BLOCKS[id]!.archetypes ?? []) out.add(composed.roster.typeOf.get(`${id}:${a.def.type}`) ?? a.def.type);
  return out;
}

/**
 * A level as the base genre generated it, with the game's blocks' entities placed (deterministic from the seed): a
 * courier's stations, and the people the game's story puts in the level at this place in the game.
 */
export function dressLevel(level: LevelJson, seed: number, file: FreeformSystemsJson, composed: Composed, feel: FeelPreset, at: LevelAt = {}): LevelJson {
  let out = level;
  for (const id of blocksOf(file)) {
    const dress = BLOCKS[id]!.dress;
    if (dress) out = dress(out, seed, blockCtx(file, composed, id, feel, at));
  }
  return out;
}

/** What the game's blocks find wrong with their entities on a level (the level's place in the game read from its id). */
export function blockLevelIssues(level: LevelJson, file: FreeformSystemsJson, composed: Composed, feel: FeelPreset, story: DialogueFile | null = null): Issue[] {
  const at: LevelAt = { level: levelIndexOf(level.id), story };
  return blocksOf(file).flatMap((id) => BLOCKS[id]!.checkLevel?.(level, blockCtx(file, composed, id, feel, at)) ?? []);
}

/** The bots the game's blocks bring to play their jobs (the courier), by name. */
export function blockBots(file: Pick<FreeformSystemsJson, 'systems'>): Record<string, BotPolicy> {
  const out: Record<string, BotPolicy> = {};
  for (const s of file.systems) {
    const bot = BLOCKS[s.id]?.bot;
    if (bot) out[bot.name || s.id] = bot;
  }
  return out;
}
