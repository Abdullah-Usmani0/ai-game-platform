import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { LevelJson, ScopeTier } from '@gg/schemas';
import { createSim, type FeedbackBinding, type Sim } from '@gg/sdk';
import { levelPlan, levelQuality, plannedLevelCount, rankCorrelation, runBot, scriptFromLog, simOptionsFor, systemsJsonFor, type GenreManifest, type LevelQuality } from '@gg/template-core';
import { GENRES } from '@gg/templates/node';

/**
 * `pnpm --filter @gg/evals quality`: the curated calibration. For every curated genre and scope tier it builds the levels
 * a game gets (the shared level plan, each level accepted by the validator and the solver bot at its play seed, as the
 * scaffold does), takes the solver's run as the proof, and measures each level with the genre-free quality measures
 * (template-core quality.ts): explorer effort, jitter robustness, afk and random wins, verbs needed, feedback coverage,
 * and per game the difficulty ramp. curated-band.json keeps each measure's p5, median and p95 per genre and overall:
 * the band games without a curated solver will be held to.
 */
const here = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    genre: { type: 'string' },
    budget: { type: 'string', default: '60000' },
    out: { type: 'string', default: resolve(here, 'curated-band.json') },
  },
});
const budget = Number(values.budget);
const TIERS: ScopeTier[] = ['small', 'medium', 'large'];

interface Measured {
  genre: string;
  tier: ScopeTier;
  game: number;
  level: string;
  q: LevelQuality;
}

/** The levels one game of a genre and tier gets, each with the run of the solver bot that proves it. */
function buildGame(g: GenreManifest, tier: ScopeTier, game: number) {
  const budgetOf = g.scopeBudget[tier];
  const bosses = g.entityDefs.some((e) => e.boss) ? Math.min(1, budgetOf.bosses) : 0;
  const plan = levelPlan(g.levelGrammar.kind, { levels: plannedLevelCount(g.levelGrammar.kind, budgetOf.levels), bosses, tier });
  const systems = systemsJsonFor(g);
  const feedback = [...g.gddDefaults.feedbackEvents, ...(g.feedbackExtras ?? [])] as FeedbackBinding[];
  const out: Array<{ id: string; make: () => Sim; proof: { script: ReturnType<typeof scriptFromLog>; ticks: number } }> = [];
  for (const slot of plan) {
    for (let s = 1000 * game + 50 * slot.index; s < 1000 * game + 50 * slot.index + 40; s++) {
      const params = g.levelGrammar.kind === 'arena' ? { seed: s, difficulty: slot.difficulty } : { seed: s, difficulty: slot.difficulty, boss: slot.boss };
      const level = g.levelGrammar.generate(params) as LevelJson;
      if (!g.levelGrammar.validate(level, g.feelPresets[g.defaultFeel]!).ok) continue;
      const options = simOptionsFor(g, systems, { behaviours: g.defaultBehaviours, content: g.extraContent?.(params) ?? {}, feedback });
      const make = () => createSim({ ...options, level, seed: slot.seed });
      const sim = make();
      if (!runBot(sim, g.bots[g.solverBot]!, 90 * 60).completed) continue;
      out.push({ id: slot.id, make, proof: { script: scriptFromLog(sim, sim.tick), ticks: sim.tick } });
      break;
    }
  }
  return { out, systems: Object.values(g.systems).map((m) => m.meta), feedback };
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
function band(xs: number[]): { n: number; p5: number; p50: number; p95: number } | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => {
    const i = (s.length - 1) * q;
    const lo = Math.floor(i);
    return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (i - lo);
  };
  return { n: s.length, p5: round(at(0.05)), p50: round(at(0.5)), p95: round(at(0.95)) };
}

function summarize(levels: Measured[], ramps: Array<{ effort: number; proof: number }>) {
  const found = levels.filter((l) => l.q.explorer.found);
  return {
    levels: levels.length,
    rates: {
      explorerFound: round(found.length / Math.max(1, levels.length)),
      afkWins: round(levels.filter((l) => l.q.afkWins).length / Math.max(1, levels.length)),
    },
    metrics: {
      proofTicks: band(levels.map((l) => l.q.proofTicks)),
      explorerEffort: band(found.map((l) => l.q.explorer.explored)),
      explorerEffortPerProofTick: band(found.map((l) => l.q.explorer.explored / l.q.proofTicks)),
      jitter: band(levels.map((l) => l.q.jitter)),
      randomWins: band(levels.map((l) => l.q.randomWins)),
      // Verbs are measured only where the explorer finished with every key.
      verbsNeeded: band(levels.filter((l) => l.q.verbs.measured).map((l) => l.q.verbs.needed.length)),
      verbsNeededShare: band(levels.filter((l) => l.q.verbs.measured).map((l) => l.q.verbs.needed.length / Math.max(1, l.q.verbs.needed.length + l.q.verbs.optional.length))),
      feedbackAnswered: band(levels.filter((l) => l.q.feedback.fired > 0).map((l) => l.q.feedback.answered / l.q.feedback.fired)),
      unboundSalientEvents: band(levels.map((l) => l.q.feedback.unbound.length)),
      rampEffort: band(ramps.map((r) => r.effort)),
      rampProofTicks: band(ramps.map((r) => r.proof)),
    },
  };
}

const all: Measured[] = [];
const allRamps: Array<{ effort: number; proof: number }> = [];
const genres: Record<string, unknown> = {};
const t0 = Date.now();
for (const g of Object.values(GENRES).filter((x) => !values.genre || x.id === values.genre)) {
  const mine: Measured[] = [];
  const ramps: Array<{ effort: number; proof: number }> = [];
  const games = g.levelGrammar.kind === 'arena' ? 4 : 1;
  for (const tier of TIERS) {
    for (let game = 1; game <= games; game++) {
      const { out, systems, feedback } = buildGame(g, tier, game);
      const measured = out.map((l) => ({ genre: g.id, tier, game, level: l.id, q: levelQuality(l.make, l.proof, { systems, feedback, budget }) }));
      mine.push(...measured);
      if (measured.length >= 3) {
        // Effort counts only where the explorer finished: an unfinished level weighs as the whole budget.
        ramps.push({ effort: rankCorrelation(measured.map((m) => (m.q.explorer.found ? m.q.explorer.explored : budget))), proof: rankCorrelation(measured.map((m) => m.q.proofTicks)) });
      }
      console.log(`${g.id} ${tier} game ${game}: ${measured.map((m) => `${m.level} ${m.q.explorer.found ? 'found' : 'not found'} jitter ${round(m.q.jitter, 2)} verbs ${m.q.verbs.measured ? m.q.verbs.needed.join('+') || '-' : '?'}`).join('; ')}`);
    }
  }
  all.push(...mine);
  allRamps.push(...ramps);
  genres[g.id] = summarize(mine, ramps);
}
const report = {
  $comment: 'Curated calibration: the genre-free quality measures over the levels curated games get. Regenerate with `pnpm --filter @gg/evals quality`.',
  method: { explorerBudget: budget, jitter: { runs: 12, amountTicks: 2 }, random: { runs: 8 }, tiers: TIERS, arenaGamesPerTier: 4, levelGamesPerTier: 1 },
  overall: summarize(all, allRamps),
  genres,
};
writeFileSync(values.out!, JSON.stringify(report, null, 2) + '\n');
console.log(`measured ${all.length} levels in ${Math.round((Date.now() - t0) / 1000)} s; wrote ${values.out}`);
