import { defineSystem, type SimCtx } from '@gg/sdk';
import { FARM_DEFAULTS } from './rules.js';

const maxOf = (ctx: SimCtx) => Math.max(1, Math.round(Number(ctx.params['maxEnergy'] ?? FARM_DEFAULTS.maxEnergy)));

/**
 * The player's energy for the day's work, on the HUD: the farm's jobs spend it (a job it cannot pay for is not done),
 * and a night in bed fills it again. Falling asleep in the field at two brings back only half.
 */
export const energy = defineSystem<{ tired: boolean }>({
  id: 'energy',
  init(ctx) {
    ctx.world.hud['energy'] = maxOf(ctx);
    return { tired: false };
  },
  fixedUpdate(s, _input, ctx) {
    // Running dry is worth a sound once, not every tick after.
    const left = Number(ctx.world.hud['energy'] ?? 0);
    if (left <= 0 && !s.tired) ctx.emit('custom:exhausted', { day: ctx.world.hud['day'] ?? null });
    s.tired = left <= 0;
  },
  onEvent(_s, ev, ctx) {
    if (ev.name !== 'custom:day_start') return;
    const max = maxOf(ctx);
    ctx.world.hud['energy'] = ev.payload['fainted'] === true ? Math.ceil(max / 2) : max;
  },
});

export const meta = {
  id: 'energy',
  genres: ['lifesim'],
  summary: "The day's energy: tilling and watering spend it, a night's sleep restores it (half after fainting at 2 AM).",
  params: { maxEnergy: { type: 'number', min: 10, max: 300, default: FARM_DEFAULTS.maxEnergy, affects: 'levels' } },
  emits: ['custom:exhausted'],
  feedbackFor: ['custom:exhausted'],
  requires: { systems: ['day-clock'] },
} as const;
