import { defineSystem, type SimCtx } from '@gg/sdk';
import { DAY_END_MIN, DAY_START_MIN } from './farm-kit.js';
import { FARM_DEFAULTS } from './rules.js';

interface ClockState {
  day: number;
  /** Minutes since midnight: 6:00 is 360, and the night runs on past 24:00 to 2:00 (1560). */
  minute: number;
  /** How today ends, once it does: asleep in bed, or fallen asleep where the player stood at two. */
  ending: 'slept' | 'fainted' | null;
  /** The tick the next morning starts (-1 by day). */
  morningAt: number;
  fainted: boolean;
}

/** A clock face for the HUD, in ten-minute steps: 6:00 AM, 12:30 PM, 1:50 AM. */
export function clockFace(minute: number): string {
  const m = Math.floor(minute / 10) * 10;
  const h24 = Math.floor(m / 60) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function show(s: ClockState, ctx: SimCtx): void {
  ctx.world.hud['time'] = clockFace(s.minute);
  // For the view's day and night light, not shown.
  ctx.world.hud['_minute'] = Math.round(s.minute);
}

/**
 * The farm's day: the clock runs from six in the morning, a day lasting dayLengthS seconds, until the player sleeps (a
 * custom:sleep, from the bed) or two at night, when the player falls asleep where it stands. The night's events go out
 * on one tick (custom:day_end: crops grow, the bin pays) and the next morning starts two ticks later (custom:day_start:
 * energy back, the player at the bed), so everything that answers the night has run before anything reads the morning.
 * The day number is on the HUD; a season (its own system) shows it against the season's length.
 */
export const dayClock = defineSystem<ClockState>({
  id: 'day-clock',
  init(ctx) {
    const s: ClockState = { day: 1, minute: DAY_START_MIN, ending: null, morningAt: -1, fainted: false };
    ctx.world.hud['day'] = 1;
    show(s, ctx);
    return s;
  },
  fixedUpdate(s, _input, ctx) {
    if (s.morningAt >= 0) {
      if (ctx.tick < s.morningAt) return;
      s.morningAt = -1;
      s.day++;
      s.minute = DAY_START_MIN;
      ctx.respawnPlayer();
      ctx.world.hud['day'] = s.day;
      ctx.emit('custom:day_start', { day: s.day, fainted: s.fainted });
      show(s, ctx);
      return;
    }
    const perTick = (DAY_END_MIN - DAY_START_MIN) / (Math.max(10, Number(ctx.params['dayLengthS'] ?? FARM_DEFAULTS.dayLengthS)) * 60);
    s.minute = Math.min(DAY_END_MIN, s.minute + perTick);
    const before = Math.floor((s.minute - perTick) / 60);
    if (Math.floor(s.minute / 60) === 18 && before === 17) ctx.emit('custom:dusk', { day: s.day });
    if (s.minute >= DAY_END_MIN && !s.ending) s.ending = 'fainted';
    if (s.ending) {
      s.fainted = s.ending === 'fainted';
      ctx.emit('custom:day_end', { day: s.day, fainted: s.fainted });
      s.ending = null;
      s.morningAt = ctx.tick + 2;
    }
    show(s, ctx);
  },
  onEvent(s, ev) {
    if (ev.name === 'custom:sleep' && s.morningAt < 0) s.ending = 'slept';
  },
});

export const meta = {
  id: 'day-clock',
  genres: ['lifesim'],
  required: true,
  summary: 'A farm day from 6 AM: sleeping or 2 AM ends it, and overnight crops grow and the bin pays.',
  params: { dayLengthS: { type: 'number', min: 30, max: 600, default: FARM_DEFAULTS.dayLengthS, affects: 'levels' } },
  emits: ['custom:day_end', 'custom:day_start', 'custom:dusk', 'spawn'],
  feedbackFor: ['custom:day_end', 'custom:day_start', 'custom:dusk'],
  // Each morning the player wakes at the door.
  provides: { spawns: ['player'] },
} as const;
