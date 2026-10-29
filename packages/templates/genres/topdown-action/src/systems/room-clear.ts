import { defineSystem, goalCloseness, isHostile } from '@gg/sdk';

interface RoomClearState {
  done: boolean;
  total: number;
  kills: number;
  cleared: boolean;
}

/**
 * Hades-style clear rule: the exit stays locked while any hostile is alive; dying ends the run.
 * Kills score; clearing the last hostile fires custom:room_clear so the renderer can celebrate.
 */
export const roomClear = defineSystem<RoomClearState>({
  id: 'room-clear',
  init: () => ({ done: false, total: -1, kills: 0, cleared: false }),
  fixedUpdate(s, _input, ctx) {
    const w = ctx.world;
    const p = w.player;
    let hostile = 0;
    for (const e of w.entities) if (isHostile(e)) hostile++;
    if (s.total < 0) s.total = hostile;
    const requireClear = ctx.params['requireClear'] !== false;
    const open = !requireClear || hostile === 0;
    w.hud['enemies'] = hostile;
    w.hud['exit'] = open ? 'open' : 'locked';
    if (s.done) return;
    if (!p.alive) {
      s.done = true;
      w.flags.gameOver = true;
      ctx.emit('custom:game_over', { tick: ctx.tick, score: w.score, kills: s.kills });
      return;
    }
    if (hostile === 0 && s.total > 0 && !s.cleared) {
      s.cleared = true;
      ctx.emit('custom:room_clear', { tick: ctx.tick, kills: s.kills });
    }
    if (open && ctx.map.isGoal(p.x, p.y, p.w, p.h)) {
      s.done = true;
      w.flags.won = true;
      w.score += Number(ctx.params['bonus'] ?? 20);
      ctx.emit('level_complete', { level: w.levelId, score: w.score, deaths: w.deaths, kills: s.kills });
    }
  },
  onEvent(s, ev, ctx) {
    if (ev.name === 'pickup' && ev.payload['type'] === String(ctx.params['healType'] ?? 'gem')) {
      const p = ctx.world.player;
      p.hp = Math.min(p.maxHp, p.hp + Number(ctx.params['gemHeal'] ?? 1));
      return;
    }
    if (ev.name !== 'death' || ev.payload['type'] === 'player') return;
    s.kills++;
    ctx.world.score += Number(ctx.params['killScore'] ?? 5);
  },
  // Most of the way is the fight; the walk to the opened exit is the rest.
  progress: (s, ctx) => {
    if (s.done) return ctx.world.flags.won ? 1 : 0;
    // Before the first tick nothing is counted yet: no progress.
    if (s.total < 0) return 0;
    const fought = s.total > 0 ? s.kills / s.total : 1;
    return 0.75 * fought + (s.cleared || s.total <= 0 ? 0.25 * goalCloseness(ctx.map, ctx.world.player) : 0);
  },
});

export const meta = {
  id: 'room-clear',
  genres: ['topdown-action', 'roguelike'],
  required: true,
  summary: 'The exit is locked until every hostile is dead; kills score; gems heal; dying ends the run.',
  params: {
    requireClear: { type: 'boolean', default: true, affects: 'levels' },
    bonus: { type: 'number', min: 0, max: 100, default: 20, affects: 'none' },
    killScore: { type: 'number', min: 0, max: 50, default: 5, affects: 'none' },
    gemHeal: { type: 'number', min: 0, max: 5, default: 1, affects: 'levels' },
    healType: { type: 'string', default: 'gem', affects: 'none', composed: 'entity' },
  },
  emits: ['level_complete', 'custom:room_clear', 'custom:game_over'],
  feedbackFor: ['level_complete'],
  provides: { win: 'clear_room', death: 'game_over' },
  requires: { roles: ['hostile'] },
} as const;
