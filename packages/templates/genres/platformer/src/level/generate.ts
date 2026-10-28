import type { LevelJson } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';

/**
 * Seeded chunk-grammar generator. Difficulty 0..1 scales gap width, hazard count, enemies and wall height.
 * Emits only shapes the Celeste-class envelope can clear (gaps <= 3 tiles, walls <= 2, steps 1) so that the
 * solver mostly accepts; the caller re-seeds on rejection.
 */
export function generateLevel(params: LevelGenParams): LevelJson {
  const rng = new Rng(params.seed);
  const d = Math.max(0, Math.min(1, params.difficulty));
  const width = Math.round(params['length'] ?? 48 + d * 48);
  const height = 23;
  const floorY = 20;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const fill = (x0: number, y0: number, x1: number, y1: number, ch: string) => {
    for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) grid[y]![x] = ch;
  };
  fill(0, floorY, width - 1, height - 1, '#');
  const entities: LevelJson['entities'] = [];
  const coinAt = (x: number, y: number) => entities.push({ type: 'coin', x, y, props: {} });
  // Safe start: 10 flat tiles, then chunks until 6 tiles before the end.
  let x = 10;
  coinAt(6, floorY - 2);
  const enemyBudget = Math.round(1 + d * 4);
  let enemies = 0;
  while (x < width - 10) {
    const roll = rng.float();
    if (roll < 0.28) {
      // Pit with spikes at the bottom; width 2 (easy) or 3 (hard).
      const w = d > 0.5 && rng.chance(d) ? 3 : 2;
      fill(x, floorY, x + w - 1, floorY + 1, '.');
      fill(x, floorY + 2, x + w - 1, floorY + 2, '^');
      x += w + 4;
    } else if (roll < 0.5) {
      // One-tile step up for 4-6 tiles, then back down.
      const len = 4 + rng.int(3);
      fill(x, floorY - 1, x + len - 1, floorY - 1, '#');
      coinAt(x + Math.floor(len / 2), floorY - 3);
      x += len + 3;
    } else if (roll < 0.66) {
      // Wall of height 2 (needs a held jump); height 1 when easy.
      const h = d < 0.3 ? 1 : 2;
      fill(x, floorY - h, x, floorY - 1, '#');
      x += 5;
    } else if (roll < 0.84) {
      // One-way platform two tiles up with coins on top.
      const len = 5 + rng.int(3);
      fill(x, floorY - 3, x + len - 1, floorY - 3, '-');
      for (let i = 1; i < len - 1; i += 2) coinAt(x + i, floorY - 5);
      x += len + 2;
    } else {
      // Enemy on flat ground.
      if (enemies < enemyBudget) {
        const type = d > 0.6 && rng.chance(0.4) ? 'hopper' : 'walker';
        entities.push({ type, x: x + 2, y: floorY - 1, props: {} });
        enemies++;
      }
      x += 6;
    }
  }
  if (enemies === 0 && enemyBudget > 0) entities.push({ type: 'walker', x: Math.max(14, width - 14), y: floorY - 1, props: {} });
  grid[floorY - 1]![width - 2] = 'G';
  grid[floorY - 1]![2] = 'S';
  return {
    version: 1,
    id: `gen-${params.seed}`,
    name: `Generated ${params.seed}`,
    tileSize: 8,
    width,
    height,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal', S: 'spawn' },
    rows: grid.map((r) => r.join('')),
    entities,
    spawn: { x: 2, y: floorY - 1 },
    goal: { x: width - 2, y: floorY - 1 },
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}
