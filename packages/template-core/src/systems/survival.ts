import { defineSystem } from '@gg/sdk';

/** Survive until the timer runs out to win; dying ends the run. */
export const survival = defineSystem<{ done: boolean }>({
  id: 'survival',
  init: () => ({ done: false }),
  fixedUpdate(s, _input, ctx) {
    const w = ctx.world;
    const winAt = Math.round(Number(ctx.params['winAtS'] ?? 60) * 60);
    w.hud['time'] = Math.max(0, Math.ceil((winAt - ctx.tick) / 60));
    if (s.done) return;
    if (!w.player.alive) {
      s.done = true;
      w.flags.gameOver = true;
      ctx.emit('custom:game_over', { tick: ctx.tick, score: w.score });
      return;
    }
    if (ctx.tick >= winAt) {
      s.done = true;
      w.flags.won = true;
      w.score += Number(ctx.params['winBonus'] ?? 50);
      ctx.emit('level_complete', { level: w.levelId, score: w.score, deaths: w.deaths });
    }
  },
  progress: (_s, ctx) => (ctx.world.player.alive ? ctx.tick / Math.round(Number(ctx.params['winAtS'] ?? 60) * 60) : 0),
});

export const meta = {
  id: 'survival',
  genres: ['survivors', 'shmup'],
  required: true,
  summary: 'Win by surviving until the timer ends; dying ends the run.',
  params: {
    winAtS: { type: 'number', min: 20, max: 900, default: 60, affects: 'none' },
    winBonus: { type: 'number', min: 0, max: 500, default: 50, affects: 'none' },
  },
  emits: ['level_complete', 'custom:game_over'],
  feedbackFor: ['level_complete'],
  provides: { win: 'survive', death: 'game_over' },
} as const;
