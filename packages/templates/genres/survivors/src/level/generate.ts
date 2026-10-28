import type { LevelJson, WaveTable } from '@gg/schemas';
import { Rng } from '@gg/sdk';
import type { LevelGenParams } from '@gg/template-core';

/** A walled arena with a few 2x2 pillars. Spawn at the centre; the goal tile is unused (survival wins). */
export function generateArena(params: LevelGenParams): LevelJson {
  const rng = new Rng(params.seed);
  const d = Math.max(0, Math.min(1, params.difficulty));
  const width = Math.round(params['length'] ?? 56);
  const height = 34;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  for (let x = 0; x < width; x++) {
    grid[0]![x] = '#';
    grid[height - 1]![x] = '#';
  }
  for (let y = 0; y < height; y++) {
    grid[y]![0] = '#';
    grid[y]![width - 1] = '#';
  }
  const pillars = 2 + Math.round(d * 6);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let i = 0; i < pillars; i++) {
    const px = 3 + rng.int(width - 8);
    const py = 3 + rng.int(height - 8);
    if (Math.abs(px - cx) < 5 && Math.abs(py - cy) < 5) continue;
    for (let y = py; y < py + 2; y++) for (let x = px; x < px + 2; x++) grid[y]![x] = '#';
  }
  grid[cy]![cx] = 'S';
  grid[cy]![cx + 1] = 'G';
  return {
    version: 1,
    id: `arena-${params.seed}`,
    name: `Arena ${params.seed}`,
    tileSize: 8,
    width,
    height,
    legend: { '.': 'air', '#': 'solid', S: 'spawn', G: 'goal' },
    rows: grid.map((r) => r.join('')),
    entities: [],
    spawn: { x: cx, y: cy },
    goal: { x: cx + 1, y: cy },
    ramp: { segment: 0, difficulty: Math.round(d * 100) / 100 },
  };
}

/** Waves ramp with difficulty: more enemies sooner, brutes after the midpoint. */
export function generateWaves(params: LevelGenParams, durationS = 60): WaveTable {
  const d = Math.max(0, Math.min(1, params.difficulty));
  const waves: WaveTable['waves'] = [];
  // Calibrated with scripts/balance-sweep.ts against the default auto-attack (1 damage / 30 ticks, chaser hp 2) and
  // the kiter solver: spawn rate ~0.75/s at difficulty 0.25, ~1.1/s at 0.5 (the solver's limit), ~1.5/s at 1.0.
  const interval = 6 - Math.round(d);
  for (let t = 2; t < durationS; t += interval) {
    const progress = t / durationS;
    const count = Math.round(2 + d * 2 + progress * (3 + d * 4));
    const spawns: WaveTable['waves'][number]['spawns'] = [{ enemy: 'chaser', count, pattern: progress < 0.3 ? 'edge' : 'ring' }];
    if (progress > 0.5 && d > 0.5) spawns.push({ enemy: 'brute', count: 1 + Math.round((d - 0.5) * 4), pattern: 'edge' });
    waves.push({ atS: t, spawns });
  }
  return { version: 1, designNotes: `difficulty ${d} ramp over ${durationS}s`, waves };
}
