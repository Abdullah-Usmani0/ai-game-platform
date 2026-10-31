import { centerX, centerY, defineSystem, type SimCtx } from '@gg/sdk';

interface ArenaState {
  /** The boss that woke (`custom:boss`), or -1. */
  boss: number;
  /** The doorway tiles shut behind the hero, as tile x, y pairs; empty while the arena is open. */
  shut: number[];
}

/** The room a body's middle is in, or undefined. */
function roomOf(ctx: SimCtx, x: number, y: number) {
  const ts = ctx.map.tileSize;
  const tx = Math.floor(x / ts);
  const ty = Math.floor(y / ts);
  return (ctx.map.level.rooms ?? []).find((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
}

/**
 * The boss's arena: once a boss wakes (its behaviour emits `custom:boss`) and the hero is two tiles inside the boss's
 * room, the room's doorways shut behind them: the air in its two edge columns turns to stone (`custom:arena_shut`). They
 * open when the boss falls (`custom:arena_open`), or the hero does: a fall in the arena loads the last rest again, the
 * doorways open and the boss whole. A beaten boss stays beaten, so its room stays open.
 */
export const arena = defineSystem<ArenaState>({
  id: 'arena',
  init: () => ({ boss: -1, shut: [] }),
  fixedUpdate(s, _input, ctx) {
    const boss = s.boss >= 0 ? ctx.world.entities.find((e) => e.id === s.boss) : undefined;
    const p = ctx.world.player;
    if (s.shut.length > 0) {
      // Open again when the boss falls, or the hero does (before the fall's save is taken: the shut is never kept).
      if (boss?.alive && p.alive) return;
      for (let i = 0; i < s.shut.length; i += 2) ctx.map.setKind(s.shut[i]!, s.shut[i + 1]!, 'air');
      ctx.emit('custom:arena_open', { entity: s.boss });
      s.shut = [];
      s.boss = -1;
      return;
    }
    if (!boss || !boss.alive) {
      s.boss = -1;
      return;
    }
    const room = roomOf(ctx, centerX(boss), centerY(boss));
    if (!room || !p.alive || roomOf(ctx, centerX(p), centerY(p)) !== room) return;
    const tx = Math.floor(centerX(p) / ctx.map.tileSize);
    if (tx < room.x + 2 || tx > room.x + room.w - 3) return;
    for (const x of [room.x, room.x + room.w - 1]) {
      for (let y = room.y; y < room.y + room.h; y++) {
        if (ctx.map.kindAt(x, y) !== 'air') continue;
        ctx.map.setKind(x, y, 'solid');
        s.shut.push(x, y);
      }
    }
    if (s.shut.length > 0) ctx.emit('custom:arena_shut', { entity: boss.id });
  },
  onEvent(s, ev) {
    if (ev.name === 'custom:boss' && s.shut.length === 0) s.boss = Number(ev.payload['entity']);
  },
});

export const meta = {
  id: 'arena',
  genres: ['castle'],
  required: true,
  summary: "The boss's arena: once a boss wakes and the hero is inside its room, the room's doorways shut behind them; they open when the boss falls.",
  params: {},
  emits: ['custom:arena_shut', 'custom:arena_open'],
  feedbackFor: ['custom:arena_shut', 'custom:arena_open'],
  controls: {},
  hud: [],
} as const;
