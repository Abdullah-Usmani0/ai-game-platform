import { defineSystem, type SimCtx } from '@gg/sdk';
import { seasonQuota } from './economy.js';
import { cropsOf, goldOf } from './farm-kit.js';
import { FARM_DEFAULTS, FARM_TYPES, farmRulesOf, typeParam } from './rules.js';

/**
 * The season's quota, the gold the purse must hold: what the level names on its shipping bin (props.quota, what the
 * buyer expects), else a share of what an ideal farmer would earn on the level's plots with the game's crops and rules
 * (seasonQuota).
 */
export function quotaOf(ctx: Pick<SimCtx, 'world' | 'map' | 'params' | 'paramsOf' | 'content'>): number {
  const binType = typeParam(ctx, 'binType', FARM_TYPES.bin);
  const bin = ctx.world.entities.find((e) => e.type === binType && typeof e.props['quota'] === 'number');
  if (bin) return Math.max(1, Math.round(Number(bin.props['quota'])));
  const plotType = typeParam(ctx, 'plotType', FARM_TYPES.plot);
  const plots = ctx.map.level.entities.filter((e) => e.type === plotType).length;
  return seasonQuota(plots, ctx.map.level.ramp?.difficulty ?? 0.25, cropsOf(ctx), farmRulesOf(ctx));
}

interface SeasonState {
  quota: number;
  day: number;
  done: boolean;
}

/**
 * A farming season, won by the purse: the level is won the moment the gold reaches the season's quota, and lost when
 * its last day (days) ends short of it. The purse starts with startGold, enough for a first pack or two of seeds. The
 * HUD shows the day against the season's length, and the quota.
 */
export const season = defineSystem<SeasonState>({
  id: 'season',
  init(ctx) {
    const s: SeasonState = { quota: quotaOf(ctx), day: 1, done: false };
    ctx.world.hud['gold'] = farmRulesOf(ctx).startGold;
    ctx.world.hud['quota'] = s.quota;
    return s;
  },
  fixedUpdate(s, _input, ctx) {
    const w = ctx.world;
    w.hud['day'] = `${s.day}/${farmRulesOf(ctx).days}`;
    if (s.done || goldOf(ctx) < s.quota) return;
    s.done = true;
    w.flags.won = true;
    w.score = goldOf(ctx);
    ctx.emit('level_complete', { level: w.levelId, score: w.score, deaths: w.deaths });
  },
  onEvent(s, ev, ctx) {
    if (ev.name !== 'custom:day_start') return;
    const days = farmRulesOf(ctx).days;
    s.day = Number(ev.payload['day'] ?? s.day + 1);
    if (s.done || s.day <= days) return;
    // The last day ended short of the quota.
    s.done = true;
    s.day = days;
    ctx.world.flags.gameOver = true;
    ctx.emit('custom:season_over', { gold: goldOf(ctx), quota: s.quota });
  },
  progress: (s, ctx) => Math.min(1, goldOf(ctx) / s.quota),
  // A season lasts its days, each at most a full day on the clock and the menus between (the bed, the morning's card,
  // the shop).
  levelTicks(ctx) {
    const r = farmRulesOf(ctx);
    return r.days * (Math.round(r.dayLengthS * 60) + 600) + 600;
  },
});

export const meta = {
  id: 'season',
  genres: ['lifesim'],
  required: true,
  summary: "Win a farming season by the purse: reach its gold quota before its last day ends (the level's bin may name the quota).",
  params: {
    days: { type: 'number', min: 3, max: 28, default: FARM_DEFAULTS.days, affects: 'levels' },
    share: { type: 'number', min: 0.1, max: 0.9, default: FARM_DEFAULTS.share, affects: 'levels' },
    startGold: { type: 'number', min: 0, max: 1000, default: FARM_DEFAULTS.startGold, affects: 'levels' },
    binType: { type: 'string', default: FARM_TYPES.bin, affects: 'none', composed: 'entity' },
    plotType: { type: 'string', default: FARM_TYPES.plot, affects: 'none', composed: 'entity' },
  },
  emits: ['level_complete', 'custom:season_over'],
  feedbackFor: ['level_complete', 'custom:season_over'],
  provides: { win: 'earn' },
  requires: { systems: ['day-clock'] },
} as const;
