/**
 * Every catalog system does what its metadata says, and nothing else: the composition rules (one movement, one win, one
 * death owner per game) and the catalog shown to models are only as true as these declarations. Each genre is played by
 * all its bots on three generated levels, with every system wrapped so the events it causes, the entities it spawns, the
 * numbers it keeps on the HUD and the won and game-over flags it sets are put down to it. Fails on anything undeclared,
 * and on a declared win that no run ever reaches.
 */
import type { GameEventRecord, LevelJson, SystemsFile } from '@gg/schemas';
import { createSim, DEFAULT_SEED, levelSeed, type FeedbackBinding, type SimCtx, type SystemDef } from '@gg/sdk';
import { conformance, levelTicksOf, runBot, simOptionsFor, systemsJsonFor, type BotPolicy, type GenreManifest } from '@gg/template-core';
import { BASE_MANIFESTS, EXAMPLES, freeformManifest, generatorParams, proveLevel } from '@gg/template-freeform/node';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

interface Seen {
  emits: Set<string>;
  spawns: Set<string>;
  /** HUD keys it set to a number (what objectives can count); text and the view's own '_' keys are not counted. */
  hud: Set<string>;
  won: boolean;
  gameOver: boolean;
}

/** A level to play, with the content generated with it (an arena's waves) and the game's own (its objectives). */
interface Case {
  level: LevelJson;
  content: Record<string, unknown>;
}

/**
 * Plays every case with each bot, every system of the game wrapped so what happens during its calls is put down to it,
 * and holds what each did to its metadata. The solver plays as long as the rules let a level last (a farm season runs
 * for days); the other bots a while.
 */
function probe(label: string, g: GenreManifest, systems: SystemsFile, cases: readonly Case[], bots: Readonly<Record<string, BotPolicy>>, solver: string): void {
  const seen = new Map<string, Seen>();
  const rec = (id: string): Seen => {
    let r = seen.get(id);
    if (!r) seen.set(id, (r = { emits: new Set(), spawns: new Set(), hud: new Set(), won: false, gameOver: false }));
    return r;
  };
  let current: string | null = null;
  // Runs one call of a system with what happens during it put down to the system.
  const attributed = (id: string, ctx: SimCtx, call: () => void) => {
    const before = { ...ctx.world.flags };
    const hud = { ...ctx.world.hud };
    current = id;
    try {
      call();
    } finally {
      current = null;
    }
    for (const [k, v] of Object.entries(ctx.world.hud)) if (v !== hud[k] && typeof v === 'number' && !k.startsWith('_')) rec(id).hud.add(k);
    if (ctx.world.flags.won && !before.won) rec(id).won = true;
    if (ctx.world.flags.gameOver && !before.gameOver) rec(id).gameOver = true;
  };
  const wrap = (sys: SystemDef<unknown>): SystemDef<unknown> =>
    g.systems[sys.id]
      ? {
          ...sys,
          fixedUpdate: (state, input, ctx) => attributed(sys.id, ctx, () => sys.fixedUpdate(state, input, ctx)),
          onEvent: sys.onEvent ? (state, ev: GameEventRecord, ctx) => attributed(sys.id, ctx, () => sys.onEvent!(state, ev, ctx)) : undefined,
        }
      : sys;
  const wavesTypes = new Set<string>();
  const feedback = [...g.gddDefaults.feedbackEvents, ...(g.feedbackExtras ?? [])] as FeedbackBinding[];
  for (const [i, { level, content }] of cases.entries()) {
    for (const m of JSON.stringify(content['waves'] ?? null).matchAll(/"([a-z][a-z0-9_-]*)"/g)) wavesTypes.add(m[1]!);
    const options = simOptionsFor(g, systems, { behaviours: g.defaultBehaviours, content, feedback });
    for (const [name, bot] of Object.entries(bots)) {
      const sim = createSim({ ...options, systems: options.systems.map(wrap), level, seed: levelSeed(DEFAULT_SEED, i) });
      sim.events.on('*', (ev) => {
        if (!current) return;
        rec(current).emits.add(ev.name);
        if (ev.name === 'spawn') rec(current).spawns.add(String(ev.payload['type']));
      });
      runBot(sim, bot, name === solver ? levelTicksOf(options) : 4000);
    }
  }
  for (const [id, r] of seen) {
    const meta = g.systems[id]!.meta;
    expect([...r.emits].filter((e) => !meta.emits.includes(e)), `${label}/${id} emits undeclared events`).toEqual([]);
    const spawns = meta.provides?.spawns ?? [];
    // A type it spawns by a parameter the game's composition sets (a freeform game's own name for the drop) counts too.
    const composed = g.composedParams?.[id] ?? {};
    const renamed = Object.entries(meta.params).flatMap(([k, p]) => (p.composed === 'entity' && spawns.includes(String(p.default)) && composed[k] !== undefined ? [String(composed[k])] : []));
    const allowed = (t: string) => spawns.includes(t) || renamed.includes(t) || (spawns.includes('waves') && wavesTypes.has(t));
    expect([...r.spawns].filter((t) => !allowed(t)), `${label}/${id} spawns undeclared types`).toEqual([]);
    expect([...r.hud].filter((k) => !(meta.hud ?? []).includes(k)).sort(), `${label}/${id} keeps undeclared numbers on the HUD`).toEqual([]);
    if (r.won) expect(meta.provides?.win, `${label}/${id} wins the level without declaring a win`).toBeDefined();
    if (r.gameOver) expect(['game_over', 'lives'], `${label}/${id} ends the run without declaring it`).toContain(meta.provides?.death);
  }
  for (const [id, m] of Object.entries(g.systems)) {
    if (m.meta.provides?.win) expect(seen.get(id)?.won, `${label}/${id} declares a win no run reached`).toBe(true);
  }
}

describe('systems do what their metadata says', () => {
  for (const g of Object.values(GENRES)) {
    it(`${g.id}`, () => {
      // Seeds as the levels are played: the second level at seed 2, and so on (each case is one level of a game).
      const cases = [{ seed: 1, difficulty: 0.3 }, { seed: 2, difficulty: 0.6 }, { seed: 3, difficulty: 0.55, boss: 1 }].map((params) => ({ level: g.levelGrammar.generate(params), content: g.extraContent?.(params) ?? {} }));
      probe(g.id, g, systemsJsonFor(g), cases, g.bots, g.solverBot);
    });
  }
});

describe('the systems of every freeform example do what their metadata says too', () => {
  // Composed across genres, with the blocks only freeform games have (a runner): each plays its first level, the run a
  // bot recorded winning it and chaos.
  for (const ex of EXAMPLES) {
    it(ex.id, () => {
      const m = freeformManifest(ex.systems, ex.roster);
      const params = { seed: 1, difficulty: 0.2, ...generatorParams(ex.systems, ex.gdd.targets.levelTimeS) };
      const level: LevelJson = { ...m.levelGrammar.generate(params), id: 'l01' };
      const content = { ...(m.extraContent?.(params) ?? {}), ...(ex.objectives ? { objectives: ex.objectives } : {}), ...ex.content };
      const base = BASE_MANIFESTS[ex.systems.composition.base];
      const run = proveLevel(level, 0, { file: ex.systems, roster: ex.roster, content, solver: base.bots[base.solverBot], budget: 20_000 }).proof;
      expect(run, `${ex.id}: a winning run of its first level`).not.toBeNull();
      const kit = freeformManifest(ex.systems, ex.roster, [run!]);
      probe(`freeform:${ex.id}`, kit, ex.systems, [{ level, content }], { [kit.solverBot]: kit.bots[kit.solverBot]!, chaos: kit.bots['chaos']! }, kit.solverBot);
    }, 60_000);
  }
});

describe('every genre passes the whole-game checks a bespoke system is held to', () => {
  // A game built on a genre adds its own systems; the checks must find nothing in the genre itself: its state saves and
  // loads, two games side by side play as one alone, and standing still never wins.
  for (const g of Object.values(GENRES)) {
    it(g.id, () => {
      const params = { seed: 3, difficulty: 0.4 };
      const options = simOptionsFor(g, systemsJsonFor(g), { behaviours: g.defaultBehaviours, content: g.extraContent?.(params) ?? {} });
      const r = conformance({ options, levels: [{ level: g.levelGrammar.generate(params), seed: 1 }], contracts: [], bespoke: [], bots: { chaos: g.bots['chaos']! }, ticks: Math.min(levelTicksOf(options), 3600) });
      expect(r.issues).toEqual([]);
    });
  }
});
