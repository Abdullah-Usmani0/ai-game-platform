import { defineSystem, goalCloseness } from '@gg/sdk';

export const goal = defineSystem<{ done: boolean }>({
  id: 'goal',
  init: () => ({ done: false }),
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (s.done || !p.alive) return;
    if (ctx.map.isGoal(p.x, p.y, p.w, p.h)) {
      s.done = true;
      ctx.world.flags.won = true;
      ctx.world.score += Number(ctx.params['bonus'] ?? 10);
      ctx.emit('level_complete', { level: ctx.world.levelId, score: ctx.world.score, deaths: ctx.world.deaths });
    }
  },
  progress: (s, ctx) => (s.done ? 1 : goalCloseness(ctx.map, ctx.world.player)),
});

export const meta = {
  id: 'goal',
  genres: ['platformer', 'metroidvania'],
  required: true,
  summary: 'Reaching a goal tile completes the level and awards a bonus.',
  params: { bonus: { type: 'number', min: 0, max: 100, default: 10, affects: 'none' } },
  emits: ['level_complete'],
  feedbackFor: ['level_complete'],
} as const;
