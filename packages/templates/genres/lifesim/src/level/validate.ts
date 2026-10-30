import type { LevelJson } from '@gg/schemas';
import { Tilemap } from '@gg/sdk';
import { err, report, warn, type Issue, type ValidationReport } from '@gg/validators';
import { DECOR_TYPES, ENTITY_DEFS } from '../entities.js';
import { idealSeason, seasonQuota } from '../systems/economy.js';
import { DEFAULT_CROPS } from '../systems/farm-kit.js';
import { farmRules, FARM_TYPES } from '../systems/rules.js';

const SIZE: Record<string, { w: number; h: number }> = Object.fromEntries(ENTITY_DEFS.map((d) => [d.type, { w: d.w, h: d.h }]));
const key = (x: number, y: number) => `${x},${y}`;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** The tiles an entity covers: its anchor is its bottom-left tile, and it reaches right and up. */
export function footprint(e: { type: string; x: number; y: number }, ts: number): Array<{ x: number; y: number }> {
  const s = SIZE[e.type] ?? { w: ts, h: ts };
  const tw = Math.max(1, Math.ceil(s.w / ts));
  const th = Math.max(1, Math.ceil(s.h / ts));
  const out: Array<{ x: number; y: number }> = [];
  for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) out.push({ x: e.x + dx, y: e.y - dy });
  return out;
}

/** Breadth-first walking distances, in tiles, from a tile over everything that is not a wall. */
export function farmDistances(map: Tilemap, from: { x: number; y: number }): Map<string, number> {
  const dist = new Map<string, number>([[key(from.x, from.y), 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(key(cur.x, cur.y))!;
    for (const [dx, dy] of STEPS) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (dist.has(key(x, y)) || x < 0 || y < 0 || x >= map.width || y >= map.height || map.kindAt(x, y) === 'solid') continue;
      dist.set(key(x, y), d + 1);
      queue.push({ x, y });
    }
  }
  return dist;
}

/**
 * Farm check: fenced in, the door step clear, a shipping bin, a bed and four plots or more; every plot, and a tile
 * beside the bin, the bed and the stall, in reach of the door step; no two things on one tile and no plot in a wall;
 * scenery on wall tiles (a tree the player walks through looks broken); and a season that pays: an ideal farmer on
 * these plots, with the default crops and rules, earns more than the season asks. The farmer bot then proves the
 * game's own crops and rules.
 */
export function validateFarm(level: LevelJson): ValidationReport {
  const issues: Issue[] = [];
  const map = new Tilemap(level);
  const ts = level.tileSize;
  const solid = (x: number, y: number) => map.kindAt(x, y) === 'solid';
  for (let x = 0; x < map.width; x++) if (!solid(x, 0) || !solid(x, map.height - 1)) { issues.push(err('farm_open', 'the top and bottom fences must be solid')); break; }
  for (let y = 0; y < map.height; y++) if (!solid(0, y) || !solid(map.width - 1, y)) { issues.push(err('farm_open', 'the left and right fences must be solid')); break; }
  if (solid(level.spawn.x, level.spawn.y)) issues.push(err('spawn_blocked', 'the door step (spawn) is inside a wall', { x: level.spawn.x, y: level.spawn.y }));

  const of = (type: string) => level.entities.filter((e) => e.type === type);
  const plots = of(FARM_TYPES.plot);
  if (of(FARM_TYPES.bin).length === 0) issues.push(err('bin_missing', 'no shipping bin: nothing can be sold'));
  if (of(FARM_TYPES.bed).length === 0) issues.push(err('bed_missing', 'no bed: every day ends asleep in the field'));
  if (of(FARM_TYPES.shop).length === 0) issues.push(warn('shop_missing', 'no seed shop: only the starter seeds can be sown'));
  if (plots.length < 4) issues.push(err('too_few_plots', `${plots.length} plots (minimum 4)`));
  if (plots.length > 48) issues.push(err('too_many_plots', `${plots.length} plots (maximum 48)`));

  // What stands where: the things the player works may not share a tile; plots lie on open ground; scenery on walls.
  const worked = new Map<string, string>();
  for (const e of level.entities) {
    const tiles = footprint(e, ts);
    if (tiles.some((t) => t.x < 0 || t.y < 0 || t.x >= map.width || t.y >= map.height)) {
      issues.push(err('entity_outside', `${e.type} at ${e.x},${e.y} reaches off the farm`, { x: e.x, y: e.y }));
      continue;
    }
    if (DECOR_TYPES.includes(e.type)) {
      if (tiles.some((t) => !solid(t.x, t.y))) issues.push(warn('decor_walkable', `${e.type} at ${e.x},${e.y} stands on open ground: the player walks through it`, { x: e.x, y: e.y }));
      continue;
    }
    if (e.type === FARM_TYPES.plot && solid(e.x, e.y)) issues.push(err('plot_in_wall', `plot at ${e.x},${e.y} is inside a wall`, { x: e.x, y: e.y }));
    for (const t of tiles) {
      const there = worked.get(key(t.x, t.y));
      if (there) issues.push(err('overlap', `${e.type} at ${e.x},${e.y} shares tile ${t.x},${t.y} with a ${there}`, { x: t.x, y: t.y }));
      else worked.set(key(t.x, t.y), e.type);
    }
  }

  // A wall inside the fence is drawn by what stands on it (the house, a tree, the stall): one with nothing on it is an
  // invisible wall.
  const drawn = new Set(level.entities.flatMap((e) => footprint(e, ts).map((t) => key(t.x, t.y))));
  let bare = 0;
  for (let y = 1; y < map.height - 1; y++) for (let x = 1; x < map.width - 1; x++) if (solid(x, y) && !drawn.has(key(x, y))) bare++;
  if (bare > 0) issues.push(warn('bare_wall', `${bare} wall tiles inside the fence have nothing on them: invisible walls`));

  // In reach of the door step: every plot, and a tile beside each bin, bed and stall to work it from.
  const dist = farmDistances(map, level.spawn);
  for (const p of plots) if (!dist.has(key(p.x, p.y))) issues.push(err('plot_unreachable', `plot at ${p.x},${p.y} cannot be reached`, { x: p.x, y: p.y }));
  const standOf = (e: LevelJson['entities'][number]): number => {
    const tiles = footprint(e, ts);
    const own = new Set(tiles.map((t) => key(t.x, t.y)));
    let best = Infinity;
    for (const t of tiles) {
      for (const [dx, dy] of STEPS) {
        const k = key(t.x + dx, t.y + dy);
        if (!own.has(k) && dist.has(k)) best = Math.min(best, dist.get(k)!);
      }
    }
    return best;
  };
  const walkTo: Record<string, number> = {};
  for (const type of [FARM_TYPES.bin, FARM_TYPES.bed, FARM_TYPES.shop]) {
    for (const e of of(type)) {
      const d = standOf(e);
      if (d === Infinity) issues.push(err(`${type}_unreachable`, `no tile beside the ${type} at ${e.x},${e.y} can be reached`, { x: e.x, y: e.y }));
      else walkTo[type] = Math.min(walkTo[type] ?? Infinity, d);
    }
  }
  // A one-tile gap between walls: the player is nearly a tile wide, so squeezing through is fiddly.
  let squeezes = 0;
  for (const k of dist.keys()) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    if ((solid(x - 1, y) && solid(x + 1, y)) || (solid(x, y - 1) && solid(x, y + 1))) squeezes++;
  }
  if (squeezes > 0) issues.push(warn('squeeze', `${squeezes} tiles are one-tile gaps between walls`));

  // The season has to pay: an ideal farmer on these plots earns more than the quota, named on the bin or derived.
  const rules = farmRules(() => ({}));
  const ideal = idealSeason(plots.length, DEFAULT_CROPS, rules).gold;
  const named = of(FARM_TYPES.bin).find((b) => typeof b.props['quota'] === 'number')?.props['quota'];
  const quota = typeof named === 'number' ? named : seasonQuota(plots.length, level.ramp?.difficulty ?? 0.25, DEFAULT_CROPS, rules);
  if (plots.length >= 4 && ideal - rules.startGold < 40) issues.push(err('season_barren', `an ideal season on ${plots.length} plots earns only ${ideal - rules.startGold} gold`));
  else if (typeof named === 'number' && named > ideal) issues.push(err('quota_unreachable', `the bin asks for ${named} gold; an ideal season on these plots ends with ${ideal}`));
  const plotWalk = plots.map((p) => dist.get(key(p.x, p.y)) ?? Infinity).filter((d) => d < Infinity);
  return report(issues, {
    plots: plots.length,
    quota,
    idealGold: ideal,
    reachableTiles: dist.size,
    walkToBin: walkTo[FARM_TYPES.bin] ?? -1,
    walkToShop: walkTo[FARM_TYPES.shop] ?? -1,
    walkToField: plotWalk.length > 0 ? Math.min(...plotWalk) : -1,
    fieldSpread: plotWalk.length > 0 ? Math.max(...plotWalk) - Math.min(...plotWalk) : -1,
    squeezes,
    bareWalls: bare,
  });
}
