import type { WaveTable } from '@gg/schemas';
import { defineSystem, isHostile } from '@gg/sdk';

/** Spawns enemies from content.waves at their scheduled time using ring / edge / random / line / top patterns. Shared by every wave-driven genre. */
export const spawner = defineSystem<{ next: number; spawned: number }>({
  id: 'spawner',
  init: () => ({ next: 0, spawned: 0 }),
  fixedUpdate(s, _input, ctx) {
    const waves = (ctx.content['waves'] as WaveTable | undefined)?.waves ?? [];
    const maxAlive = Number(ctx.params['maxAlive'] ?? 80);
    const map = ctx.map;
    const p = ctx.world.player;
    while (s.next < waves.length && ctx.tick >= Math.round((waves[s.next]?.atS ?? 0) * 60)) {
      const wave = waves[s.next]!;
      for (const spawn of wave.spawns) {
        for (let i = 0; i < spawn.count; i++) {
          const alive = ctx.world.entities.filter(isHostile).length;
          if (alive >= maxAlive) break;
          let x: number;
          let y: number;
          if (spawn.pattern === 'ring') {
            const a = (i / spawn.count) * Math.PI * 2 + ctx.rng.float() * 0.2;
            x = p.x + Math.cos(a) * 120;
            y = p.y + Math.sin(a) * 120;
          } else if (spawn.pattern === 'edge') {
            const side = ctx.rng.int(4);
            const ts = map.tileSize;
            x = side === 0 ? ts * 2 : side === 1 ? map.pixelWidth - ts * 3 : ctx.rng.range(ts * 2, map.pixelWidth - ts * 3);
            y = side === 2 ? ts * 2 : side === 3 ? map.pixelHeight - ts * 3 : ctx.rng.range(ts * 2, map.pixelHeight - ts * 3);
          } else if (spawn.pattern === 'line') {
            x = map.tileSize * 2 + (i / Math.max(1, spawn.count - 1)) * (map.pixelWidth - map.tileSize * 5);
            y = map.tileSize * 2;
          } else if (spawn.pattern === 'top') {
            x = ctx.rng.range(map.tileSize * 2, map.pixelWidth - map.tileSize * 3);
            y = map.tileSize * 2;
          } else {
            x = ctx.rng.range(map.tileSize * 2, map.pixelWidth - map.tileSize * 3);
            y = ctx.rng.range(map.tileSize * 2, map.pixelHeight - map.tileSize * 3);
          }
          // Clamp inside the arena and nudge out of solids.
          x = Math.max(map.tileSize, Math.min(map.pixelWidth - map.tileSize * 2, x));
          y = Math.max(map.tileSize, Math.min(map.pixelHeight - map.tileSize * 2, y));
          if (map.isSolid(x, y, 8, 8)) continue;
          ctx.spawn(spawn.enemy, x, y);
          s.spawned++;
        }
      }
      s.next++;
    }
    ctx.world.hud['wave'] = s.next;
  },
});

export const meta = {
  id: 'spawner',
  genres: ['survivors', 'shmup'],
  required: true,
  summary: 'Spawns enemy waves from content/waves.json at scheduled times in ring, edge, random, line or top patterns.',
  params: { maxAlive: { type: 'number', min: 10, max: 200, default: 80, affects: 'none' } },
  emits: ['spawn'],
  feedbackFor: [],
  provides: { spawns: ['waves'] },
  requires: { content: ['waves'] },
} as const;
