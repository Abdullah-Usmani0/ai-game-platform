import { defineSystem } from '@gg/sdk';

export const goal = defineSystem<{ done: boolean }>({
  id: 'goal',
  init: () => ({ done: false }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (s.done || !p.alive) return;
    if (ctx.map.isGoal(p.x, p.y, p.w, p.h)) {
      s.done = true;
      ctx.world.flags.won = true;
      ctx.world.score += 10;
      ctx.emit('level_complete', { level: ctx.world.levelId, score: ctx.world.score, deaths: ctx.world.deaths });
    }
  },
});
