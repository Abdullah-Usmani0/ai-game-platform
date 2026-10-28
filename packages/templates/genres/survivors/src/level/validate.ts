import type { LevelJson, WaveTable } from '@gg/schemas';
import { Tilemap } from '@gg/sdk';
import { err, report, warn, type Issue, type ValidationReport } from '@gg/validators';

/** Arena check: walled, open interior mostly reachable from the spawn, spawn clear. */
export function validateArena(level: LevelJson): ValidationReport {
  const issues: Issue[] = [];
  const map = new Tilemap(level);
  for (let x = 0; x < map.width; x++) if (map.kindAt(x, 0) !== 'solid' || map.kindAt(x, map.height - 1) !== 'solid') { issues.push(err('arena_open', 'top/bottom border must be solid')); break; }
  for (let y = 0; y < map.height; y++) if (map.kindAt(0, y) !== 'solid' || map.kindAt(map.width - 1, y) !== 'solid') { issues.push(err('arena_open', 'left/right border must be solid')); break; }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.kindAt(level.spawn.x + dx, level.spawn.y + dy) === 'solid') issues.push(err('spawn_blocked', 'spawn needs a clear 3x3', { x: level.spawn.x, y: level.spawn.y }));
  // Flood fill from spawn.
  const seen = new Set<string>();
  const queue = [[level.spawn.x, level.spawn.y]];
  seen.add(`${level.spawn.x},${level.spawn.y}`);
  let air = 0;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.kindAt(x, y) !== 'solid') air++;
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x! + dx;
      const ny = y! + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || map.kindAt(nx, ny) === 'solid') continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  const coverage = seen.size / Math.max(1, air);
  if (coverage < 0.85) issues.push(err('arena_fragmented', `only ${(coverage * 100).toFixed(0)}% of the open area is reachable from the spawn`));
  return report(issues, { coverage: Math.round(coverage * 100) / 100, openTiles: air });
}

/** Spawn pressure vs the player's dps: total enemy hp per window must stay below what auto-attack can clear. */
export function validateWaves(waves: WaveTable, hpByEnemy: Record<string, number>, dps: number, durationS: number): ValidationReport {
  const issues: Issue[] = [];
  let cumulativeHp = 0;
  let maxBacklog = 0;
  for (const w of waves.waves) {
    if (w.atS > durationS) issues.push(warn('wave_after_end', `wave at ${w.atS}s is after the ${durationS}s win time`));
    for (const s of w.spawns) {
      if (!(s.enemy in hpByEnemy)) issues.push(err('unknown_enemy', `wave at ${w.atS}s spawns unknown enemy '${s.enemy}'`));
      cumulativeHp += s.count * (hpByEnemy[s.enemy] ?? 1);
    }
    const clearable = dps * w.atS;
    maxBacklog = Math.max(maxBacklog, cumulativeHp - clearable);
  }
  const ratio = cumulativeHp / Math.max(1, dps * durationS);
  if (ratio > 1.6) issues.push(err('pressure_too_high', `total enemy hp is ${ratio.toFixed(1)}x what the player can clear in ${durationS}s`));
  if (ratio < 0.25) issues.push(warn('pressure_too_low', `total enemy hp is only ${ratio.toFixed(2)}x the player's clearing capacity`));
  if (waves.waves.length > 0 && (waves.waves[0]?.atS ?? 0) > 10) issues.push(warn('slow_start', 'first wave arrives after 10 seconds'));
  return report(issues, { totalHp: cumulativeHp, pressureRatio: Math.round(ratio * 100) / 100, maxBacklogHp: Math.round(maxBacklog) });
}
