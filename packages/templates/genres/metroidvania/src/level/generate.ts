import type { LevelJson } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';

/**
 * Gate sizes in tiles, held under every platformer feel preset (exact-air envelope, see the package tests):
 * one jump rises 3 tiles and a double jump 6-7, so a 5-tile cliff needs the wings; a double jump carries 14-15 tiles
 * and adding the dash 20 or more, so a 16-tile spike pit needs the boots as well.
 */
export const CLIFF_TILES = 5;
export const PILLAR_TILES = 5;
export const DASH_PIT_TILES = 16;

const HEIGHT = 23;
const FLOOR_Y = 20;

/**
 * Seeded explorer generator. One cavern, 23 rows: the player starts with the wings behind them (backtrack to find
 * them), climbs a cliff only a double jump clears, takes a key from a pillar top, opens a locked door, finds the boots
 * and crosses a spike pit that needs a double jump and a dash. Difficulty adds the gates in that order
 * (key and door from 0.12, boots and pit from 0.2) and scales corridor obstacles, pits and enemies.
 */
export function generateExplore(params: LevelGenParams): LevelJson {
  const rng = new Rng(params.seed);
  const d = Math.max(0, Math.min(1, params.difficulty));
  const walk = FLOOR_Y - 1;
  const upperTop = FLOOR_Y - CLIFF_TILES;
  const upWalk = upperTop - 1;
  const withKey = d >= 0.12;
  const withDash = d >= 0.2;

  const wingsX = 3 + rng.int(2);
  const spawnX = wingsX + 9 + rng.int(3);
  const cliffX = spawnX + 22 + Math.round(d * 14) + rng.int(5);
  const pillarX = cliffX + 7 + rng.int(3);
  const doorX = pillarX + 8 + rng.int(3);
  const bootsX = doorX + 4 + rng.int(2);
  const pitX = bootsX + 6 + rng.int(2);
  const lastGate = withDash ? pitX + DASH_PIT_TILES : withKey ? doorX + 1 : cliffX + 4;
  const goalX = lastGate + 7 + rng.int(4);
  const width = goalX + 3;

  const grid = Array.from({ length: HEIGHT }, () => Array<string>(width).fill('.'));
  const fill = (x0: number, y0: number, x1: number, y1: number, ch: string) => {
    for (let y = Math.max(0, y0); y <= Math.min(HEIGHT - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) grid[y]![x] = ch;
  };
  // Cavern shell: ceiling, side walls, the lower floor and the upper floor past the cliff.
  fill(0, 0, width - 1, 0, '#');
  fill(0, 0, 0, HEIGHT - 1, '#');
  fill(width - 1, 0, width - 1, HEIGHT - 1, '#');
  fill(0, FLOOR_Y, cliffX - 1, HEIGHT - 1, '#');
  fill(cliffX, upperTop, width - 1, HEIGHT - 1, '#');

  const entities: LevelJson['entities'] = [];
  const put = (type: string, x: number, y: number) => entities.push({ type, x, y, props: {} });
  put('wings', wingsX, walk);
  put('coin', wingsX + 3, walk - 1);
  put('coin', spawnX - 3, walk - 1);

  // Lower corridor: platformer chunks between the safe start and the cliff approach.
  const enemyBudget = Math.round(d * 3);
  let enemies = 0;
  let x = spawnX + 10;
  const corridorEnd = cliffX - 6;
  while (x < corridorEnd - 4) {
    const roll = rng.float();
    if (roll < 0.25 && d >= 0.2) {
      const w = d > 0.5 && rng.chance(d) ? 3 : 2;
      fill(x, FLOOR_Y, x + w - 1, HEIGHT - 2, '.');
      fill(x, HEIGHT - 1, x + w - 1, HEIGHT - 1, '^');
      x += w + 4;
    } else if (roll < 0.5) {
      const len = 4 + rng.int(3);
      fill(x, FLOOR_Y - 1, x + len - 1, FLOOR_Y - 1, '#');
      put('coin', x + Math.floor(len / 2), FLOOR_Y - 3);
      x += len + 3;
    } else if (roll < 0.65) {
      const h = d < 0.3 ? 1 : 2;
      fill(x, FLOOR_Y - h, x, FLOOR_Y - 1, '#');
      x += 5;
    } else if (roll < 0.85) {
      const len = 5 + rng.int(3);
      fill(x, FLOOR_Y - 3, x + len - 1, FLOOR_Y - 3, '-');
      for (let i = 1; i < len - 1; i += 2) put('coin', x + i, FLOOR_Y - 5);
      x += len + 2;
    } else {
      if (enemies < enemyBudget) {
        put(d > 0.6 && rng.chance(0.4) ? 'hopper' : 'walker', x + 2, walk);
        enemies++;
      }
      x += 6;
    }
  }

  // Every cavern past the first gate has at least one guard: a walker on the flat approach to the cliff.
  if (enemies === 0 && d >= 0.15) put('walker', cliffX - 4, walk);

  if (withKey) {
    // The key waits on a pillar top only a double jump reaches; the door is set in a wall from the ceiling down.
    fill(pillarX, upWalk - PILLAR_TILES + 1, pillarX + 1, upWalk, '#');
    put('key', pillarX, upWalk - PILLAR_TILES);
    put('coin', pillarX + 1, upWalk - PILLAR_TILES);
    fill(doorX, 0, doorX, upWalk, '#');
    put('door', doorX, upWalk);
    if (d >= 0.3) put('walker', pillarX + 4, upWalk);
  }
  if (withDash) {
    put('boots', bootsX, upWalk);
    fill(pitX, upperTop, pitX + DASH_PIT_TILES - 1, HEIGHT - 2, '.');
    fill(pitX, HEIGHT - 1, pitX + DASH_PIT_TILES - 1, HEIGHT - 1, '^');
    for (const k of [4, 8, 12]) put('coin', pitX + k, upWalk - 4);
    if (d >= 0.5) put('turret', goalX - 4, upWalk);
  }

  grid[upWalk]![goalX] = 'G';
  grid[walk]![spawnX] = 'S';
  return {
    version: 1,
    id: `cavern-${params.seed}`,
    name: `Cavern ${params.seed}`,
    tileSize: 8,
    width,
    height: HEIGHT,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal', S: 'spawn' },
    rows: grid.map((r) => r.join('')),
    entities,
    spawn: { x: spawnX, y: walk },
    goal: { x: goalX, y: upWalk },
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}
