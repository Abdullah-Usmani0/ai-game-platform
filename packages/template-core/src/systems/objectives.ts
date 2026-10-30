import type { LoseClause, Objectives, WinClause } from '@gg/schemas';
import { defineSystem, goalCloseness, isHostile, isHostileDef, type SimCtx } from '@gg/sdk';

interface ObjectivesState {
  /** Ticks the level has run (menus and pause hold it, since systems do not run then). */
  elapsed: number;
  /** Hostiles defeated, by type and in all ('*'). */
  kills: Record<string, number>;
  /** Items picked up, by type and in all ('*'). */
  found: Record<string, number>;
  /** When the player respawns after a death, or -1. */
  respawnAt: number;
  done: boolean;
}

const ALL = '*';
const DEFAULT: Objectives = { version: 1, win: { mode: 'all', clauses: [{ kind: 'reach_goal' }] }, lose: [] };

/** The game's rules from content/objectives.json; a level without them is won at the goal. */
function rulesOf(ctx: Pick<SimCtx, 'content'>): Objectives {
  const o = ctx.content['objectives'] as Partial<Objectives> | undefined;
  return o?.win && Array.isArray(o.win.clauses) && o.win.clauses.length > 0 ? { version: 1, win: { mode: o.win.mode === 'any' ? 'any' : 'all', clauses: o.win.clauses }, lose: Array.isArray(o.lose) ? o.lose : [] } : DEFAULT;
}

/** Whether a clause holds now, and how far along it is (0 to 1). */
function clause(c: WinClause, s: ObjectivesState, ctx: SimCtx): { met: boolean; progress: number } {
  switch (c.kind) {
    case 'reach_goal': {
      const p = ctx.world.player;
      const met = ctx.map.isGoal(p.x, p.y, p.w, p.h);
      return { met, progress: met ? 1 : goalCloseness(ctx.map, p) };
    }
    case 'survive': {
      const need = Math.round(c.seconds * 60);
      return { met: s.elapsed >= need, progress: s.elapsed / need };
    }
    case 'defeat': {
      const kills = s.kills[c.type ?? ALL] ?? 0;
      if (c.count !== 'all') return { met: kills >= c.count, progress: kills / c.count };
      const left = ctx.world.entities.filter((e) => isHostile(e) && (c.type === undefined || e.type === c.type)).length;
      return { met: left === 0, progress: kills / Math.max(1, kills + left) };
    }
    case 'collect': {
      const n = s.found[c.type ?? ALL] ?? 0;
      return { met: n >= c.count, progress: n / c.count };
    }
    case 'hud_at_least': {
      const v = Number(ctx.world.hud[c.key] ?? 0);
      return { met: v >= c.value, progress: c.value > 0 ? v / c.value : 1 };
    }
  }
}

const lives = (lose: LoseClause[]) => lose.find((l): l is Extract<LoseClause, { kind: 'lives' }> => l.kind === 'lives')?.count;

/**
 * Wins and loses a level by the rules in content/objectives.json, for games composed from several genres' systems:
 * every clause (or any one) of reach the goal, survive, defeat, collect, a HUD value; lost when time runs out or the
 * lives do (the player respawns at the checkpoint until then; with no lives rule, always).
 */
export const objectives = defineSystem<ObjectivesState>({
  id: 'objectives',
  init: () => ({ elapsed: 0, kills: {}, found: {}, respawnAt: -1, done: false }),
  fixedUpdate(s, _input, ctx) {
    const w = ctx.world;
    const rules = rulesOf(ctx);
    if (!w.player.alive) {
      if (s.respawnAt >= 0 && ctx.tick >= s.respawnAt) {
        s.respawnAt = -1;
        ctx.respawnPlayer();
      }
    }
    if (s.done) return;
    s.elapsed++;
    for (const c of rules.win.clauses) {
      if (c.kind === 'survive') w.hud['time'] = Math.max(0, Math.ceil((Math.round(c.seconds * 60) - s.elapsed) / 60));
      if (c.kind === 'defeat' && c.count !== 'all') w.hud['defeated'] = `${s.kills[c.type ?? ALL] ?? 0}/${c.count}`;
      if (c.kind === 'collect') w.hud['collected'] = `${s.found[c.type ?? ALL] ?? 0}/${c.count}`;
    }
    const met = rules.win.clauses.map((c) => clause(c, s, ctx).met);
    if (w.player.alive && (rules.win.mode === 'any' ? met.some(Boolean) : met.every(Boolean))) {
      s.done = true;
      w.flags.won = true;
      w.score += Number(ctx.params['bonus'] ?? 20);
      ctx.emit('level_complete', { level: w.levelId, score: w.score, deaths: w.deaths });
      return;
    }
    const timeOut = rules.lose.find((l) => l.kind === 'time_out');
    if (timeOut && s.elapsed >= Math.round(timeOut.seconds * 60)) {
      s.done = true;
      w.flags.gameOver = true;
      ctx.emit('custom:game_over', { tick: ctx.tick, score: w.score, reason: 'time' });
    }
  },
  onEvent(s, ev, ctx) {
    if (s.done) return;
    const type = String(ev.payload['type'] ?? '');
    if (ev.name === 'pickup') {
      s.found[type] = (s.found[type] ?? 0) + 1;
      s.found[ALL] = (s.found[ALL] ?? 0) + 1;
    }
    if (ev.name !== 'death') return;
    if (type !== 'player') {
      // A smashed pot or a burst shot is not a defeated foe.
      if (!isHostileDef(ctx.defOf(type))) return;
      s.kills[type] = (s.kills[type] ?? 0) + 1;
      s.kills[ALL] = (s.kills[ALL] ?? 0) + 1;
      return;
    }
    const count = lives(rulesOf(ctx).lose);
    if (count !== undefined && ctx.world.deaths >= count) {
      s.done = true;
      ctx.world.flags.gameOver = true;
      ctx.emit('custom:game_over', { tick: ctx.tick, score: ctx.world.score, reason: 'lives' });
    } else s.respawnAt = ctx.tick + Number(ctx.params['respawnDelayTicks'] ?? 30);
  },
  // All clauses: the mean of how far along each is; any clause: the furthest.
  progress: (s, ctx) => {
    const rules = rulesOf(ctx);
    const p = rules.win.clauses.map((c) => Math.max(0, Math.min(1, clause(c, s, ctx).progress)));
    return rules.win.mode === 'any' ? Math.max(...p) : p.reduce((a, b) => a + b, 0) / p.length;
  },
  // The longest clock in the rules (a survival to last, the time a level allows), which menus and pause hold still: a
  // tenth more for them, and ten seconds.
  levelTicks(ctx) {
    const rules = rulesOf(ctx);
    const clocks = [...rules.win.clauses.map((c) => (c.kind === 'survive' ? c.seconds : 0)), ...rules.lose.map((l) => (l.kind === 'time_out' ? l.seconds : 0))];
    return Math.round(Math.max(0, ...clocks) * 66) + 600;
  },
});

export const meta = {
  id: 'objectives',
  genres: '*',
  summary:
    'Wins and loses a level by content/objectives.json: reach the goal, survive, defeat, collect or reach a HUD value (every clause or any one); lost when time runs out or the lives do, respawning until then.',
  params: {
    bonus: { type: 'number', min: 0, max: 200, default: 20, affects: 'none' },
    respawnDelayTicks: { type: 'number', min: 0, max: 120, default: 30, affects: 'none' },
  },
  emits: ['level_complete', 'custom:game_over', 'spawn'],
  feedbackFor: ['level_complete'],
  provides: { win: 'objectives', death: 'lives', spawns: ['player'] },
  requires: { content: ['objectives'] },
} as const;
