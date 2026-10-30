import type { LevelRoom } from '@gg/schemas';
import { centerX, centerY, defineSystem, type SimCtx } from '@gg/sdk';

/** The player's map of a region, a prop that lasts as long as their other props: '1' per room seen, '0' per room not, in the region's order. */
export const MAP_PREFIX = '_map:';

interface RoomsState {
  /** The room each entity there at the start belongs to, by entity id (-1 for none); one spawned later never sleeps. */
  home: Record<number, number>;
  current: number;
}

/** The room a tile is in, by its place in the list, or -1. */
export function roomAt(rooms: readonly LevelRoom[], tx: number, ty: number): number {
  return rooms.findIndex((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
}

/** Moves the player into the room they stand in, if it is a new one: its entities wake, the others sleep. */
function enter(s: RoomsState, ctx: SimCtx): void {
  const list = ctx.map.level.rooms ?? [];
  const ts = ctx.map.level.tileSize;
  const p = ctx.world.player;
  const r = roomAt(list, Math.floor(centerX(p) / ts), Math.floor(centerY(p) / ts));
  if (r < 0 || r === s.current) return;
  s.current = r;
  for (const e of ctx.world.entities) {
    const home = s.home[e.id];
    if (e.isPlayer || home === undefined || home < 0) continue;
    if (home !== r) e.dormant = true;
    else if (e.dormant) {
      // Woken, it starts its behaviour over, as if the room were new.
      e.dormant = false;
      if (e.fsm) e.fsm = { id: e.fsm.id, state: '', enteredTick: ctx.tick, cooldowns: {} };
    }
  }
  const room = list[r]!;
  ctx.world.hud['_room'] = room.id;
  const key = `${MAP_PREFIX}${ctx.map.level.id}`;
  const seen = String(p.props[key] ?? '').padEnd(list.length, '0').split('');
  seen[r] = '1';
  p.props[key] = seen.join('');
  ctx.emit('custom:room_enter', { room: room.id, kind: room.kind });
}

/**
 * A region's rooms: the player is always in one. Entering a room wakes the enemies that started there (their behaviour
 * from the start) and puts every other room's to sleep, marks it on the player's map and announces it. Enemies a
 * player beat stay beaten until the region loads again (a rest).
 */
export const rooms = defineSystem<RoomsState>({
  id: 'rooms',
  init(ctx) {
    const list = ctx.map.level.rooms ?? [];
    const ts = ctx.map.level.tileSize;
    const home: Record<number, number> = {};
    for (const e of ctx.world.entities) if (!e.isPlayer) home[e.id] = roomAt(list, Math.floor(centerX(e) / ts), Math.floor(centerY(e) / ts));
    // The first room is entered on the first step (before any entity moves), so whoever listens hears it announced.
    return { home, current: -1 };
  },
  fixedUpdate(s, _input, ctx) {
    if (ctx.world.player.alive) enter(s, ctx);
  },
});

export const meta = {
  id: 'rooms',
  genres: ['castle'],
  summary:
    "A region's rooms: entering one wakes the enemies that started there (their behaviour from the start) and puts the other rooms' to sleep, marks it on the player's map (seen rooms carry with the player's props) and announces it.",
  params: {},
  emits: ['custom:room_enter'],
  feedbackFor: [],
  controls: {},
  hud: ['_room'],
} as const;
