import type { LevelJson, WaveTable } from '@gg/schemas';
import type { LevelGenParams } from '@gg/template-core';

/** A bordered sky: one screen wide, the ship spawns at the bottom centre; everything else is waves. */
export function generateSky(params: LevelGenParams): LevelJson {
  const d = Math.max(0, Math.min(1, params.difficulty));
  const width = Math.round(params['length'] ?? 40);
  const height = 23;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  for (let x = 0; x < width; x++) {
    grid[0]![x] = '#';
    grid[height - 1]![x] = '#';
  }
  for (let y = 0; y < height; y++) {
    grid[y]![0] = '#';
    grid[y]![width - 1] = '#';
  }
  const spawn = { x: Math.floor(width / 2), y: height - 4 };
  grid[spawn.y]![spawn.x] = 'S';
  grid[spawn.y]![spawn.x + 1] = 'G';
  return {
    version: 1,
    id: `sky-${params.seed}`,
    name: `Sky ${params.seed}`,
    tileSize: 8,
    width,
    height,
    legend: { '.': 'air', '#': 'solid', S: 'spawn', G: 'goal' },
    rows: grid.map((r) => r.join('')),
    entities: [],
    spawn,
    goal: { x: spawn.x + 1, y: spawn.y },
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}

/**
 * Waves descend from the top: drones first, tanks after the midpoint at higher difficulty, a power pickup every
 * 15 seconds. Calibrated with scripts/balance-sweep.ts so the dodger survives through difficulty 0.5.
 */
export function generateWaves(params: LevelGenParams, durationS = 60): WaveTable {
  const d = Math.max(0, Math.min(1, params.difficulty));
  const waves: WaveTable['waves'] = [];
  const interval = 4 - Math.round(d);
  for (let t = 2; t < durationS; t += interval) {
    const progress = t / durationS;
    const count = Math.max(1, Math.round(1 + d * 2 + progress * (1 + d * 2)));
    const spawns: WaveTable['waves'][number]['spawns'] = [{ enemy: 'drone', count, pattern: 'top' }];
    if (progress > 0.4 && d > 0.35 && Math.round(t) % (interval * 2) === 0) spawns.push({ enemy: 'tank', count: 1 + (d > 0.7 ? 1 : 0), pattern: 'top' });
    waves.push({ atS: t, spawns });
  }
  for (let t = 15; t < durationS; t += 15) waves.push({ atS: t, spawns: [{ enemy: 'power', count: 1, pattern: 'top' }] });
  waves.sort((a, b) => a.atS - b.atS);
  return { version: 1, designNotes: `difficulty ${d} ramp over ${durationS}s; drones from the top, tanks after the midpoint`, waves };
}
