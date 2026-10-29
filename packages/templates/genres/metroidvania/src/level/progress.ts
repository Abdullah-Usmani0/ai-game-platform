import type { LevelEntity, LevelJson } from '@gg/schemas';
import { Tilemap, type FeelPreset } from '@gg/sdk';
import { jumpEnvelope, reachableTiles, type Envelope } from '@gg/validators';
import { DOOR_TILES, DOOR_TYPE, KEY_TYPE, PLAYER, RELIC_ABILITY } from '../entities.js';

export interface Abilities {
  doubleJump: boolean;
  dash: boolean;
}

export const NO_ABILITIES: Abilities = { doubleJump: false, dash: false };

const envelopes = new WeakMap<FeelPreset, Map<string, Envelope>>();

/** The jump envelope for an ability set, in the exact air-speed mode the ability gates are sized against. Cached. */
export function envelopeFor(feel: FeelPreset, tileSize: number, a: Abilities): Envelope {
  let byKey = envelopes.get(feel);
  if (!byKey) {
    byKey = new Map();
    envelopes.set(feel, byKey);
  }
  const key = `${tileSize}|${a.doubleJump ? 1 : 0}|${a.dash ? 1 : 0}`;
  let env = byKey.get(key);
  if (!env) {
    env = jumpEnvelope(feel, tileSize, 12, { exactAir: true, airJumps: a.doubleJump ? 1 : 0, dash: a.dash });
    byKey.set(key, env);
  }
  return env;
}

/** Rows the player's body spans (11 px at 8 px tiles: two). */
export function tallTiles(tileSize: number): number {
  return Math.max(1, Math.ceil(PLAYER.h / tileSize));
}

/** BFS distance to the nearest standing tile from which a relic at (x, y) can be touched (at it, or a jump below it). */
export function relicDistance(dist: Map<string, number>, x: number, y: number, env: Envelope): number | null {
  let best: number | null = null;
  for (let dy = 0; dy <= env.jumpUpTiles + 1; dy++) {
    const d = dist.get(`${x},${y + dy}`);
    if (d !== undefined && (best === null || d < best)) best = d;
  }
  return best;
}

/** BFS distance to a standing tile beside a door's bottom tile (where the player touches it). */
export function doorDistance(dist: Map<string, number>, door: { x: number; y: number }): number | null {
  const a = dist.get(`${door.x - 1},${door.y}`);
  const b = dist.get(`${door.x + 1},${door.y}`);
  if (a === undefined) return b ?? null;
  return b === undefined ? a : Math.min(a, b);
}

export function goalReached(dist: Map<string, number>, goal: { x: number; y: number }): boolean {
  return dist.has(`${goal.x},${goal.y}`) || dist.has(`${goal.x},${goal.y - 1}`);
}

/** Open a door in a tilemap: its column turns to air over the door's height. */
export function openDoor(map: Tilemap, door: { x: number; y: number }): void {
  for (let k = 0; k < DOOR_TILES; k++) map.setKind(door.x, door.y - k, 'air');
}

export interface ProgressStep {
  kind: 'relic' | 'door';
  type: string;
  x: number;
  y: number;
}

export interface Progression {
  /** Relics collected and doors opened, in the order the search reached them. */
  steps: ProgressStep[];
  goalReachable: boolean;
  /** The goal is out of reach before any relic or door: the level actually gates on its abilities. */
  gated: boolean;
  abilities: Abilities;
  unreachableRelics: LevelEntity[];
  lockedDoors: LevelEntity[];
  reachableTiles: number;
}

/**
 * Ability-gated reachability from the spawn: reach everything the current abilities allow, collect every reachable
 * relic (wings add an air jump, boots the dash, keys a key), open the nearest reachable door when holding a key, and
 * repeat until nothing changes. A generous superset like the platformer's solver; the solver bot is the final word.
 */
export function progression(level: LevelJson, feel: FeelPreset): Progression {
  const map = new Tilemap(level);
  const ts = level.tileSize;
  const tall = tallTiles(ts);
  const abilities: Abilities = { ...NO_ABILITIES };
  let keys = 0;
  const relics = level.entities.filter((e) => RELIC_ABILITY[e.type] !== undefined || e.type === KEY_TYPE);
  const doors = level.entities.filter((e) => e.type === DOOR_TYPE);
  const taken = new Set<LevelEntity>();
  const opened = new Set<LevelEntity>();
  const steps: ProgressStep[] = [];
  let dist = reachableTiles(map, level.spawn, envelopeFor(feel, ts, abilities), tall);
  const gated = !goalReached(dist, level.goal);
  for (let guard = 0; guard < 64; guard++) {
    const env = envelopeFor(feel, ts, abilities);
    dist = reachableTiles(map, level.spawn, env, tall);
    const found = relics
      .filter((r) => !taken.has(r))
      .map((r) => ({ r, d: relicDistance(dist, r.x, r.y, env) }))
      .filter((c): c is { r: LevelEntity; d: number } => c.d !== null)
      .sort((a, b) => a.d - b.d || a.r.x - b.r.x || a.r.y - b.r.y);
    if (found.length > 0) {
      for (const { r } of found) {
        taken.add(r);
        const ability = RELIC_ABILITY[r.type];
        if (ability === 'double-jump') abilities.doubleJump = true;
        else if (ability === 'dash') abilities.dash = true;
        else keys++;
        steps.push({ kind: 'relic', type: r.type, x: r.x, y: r.y });
      }
      continue;
    }
    if (keys > 0) {
      const door = doors
        .filter((d) => !opened.has(d))
        .map((d) => ({ d, n: doorDistance(dist, d) }))
        .filter((c): c is { d: LevelEntity; n: number } => c.n !== null)
        .sort((a, b) => a.n - b.n || a.d.x - b.d.x)[0];
      if (door) {
        keys--;
        opened.add(door.d);
        openDoor(map, door.d);
        steps.push({ kind: 'door', type: DOOR_TYPE, x: door.d.x, y: door.d.y });
        continue;
      }
    }
    break;
  }
  return {
    steps,
    goalReachable: goalReached(dist, level.goal),
    gated,
    abilities,
    unreachableRelics: relics.filter((r) => !taken.has(r)),
    lockedDoors: doors.filter((d) => !opened.has(d)),
    reachableTiles: dist.size,
  };
}
