// The mechanic-gap report: game ideas as players pitch them (ideas.json, each labelled with the mechanics it needs)
// against what the systems catalog covers. Prints how many ideas the platform can build whole now, what each missing
// mechanic is asked for, and the order to build them in (the one that makes the most ideas whole next, then the next).
//   node --import tsx src/gap.ts [--out results/gap-report.json]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { catalogFor } from '@gg/templates/node';

/**
 * Every mechanic an idea can need and what covers it: catalog systems by id, or an engine feature ('@fsm': enemy
 * behaviour as data, which bosses, chasers, telegraphs and enemy shots are made of). An empty list is a gap.
 */
export const MECHANICS: Readonly<Record<string, readonly string[]>> = {
  'move-side': ['movement-platformer', 'movement-metroidvania'],
  'move-topdown': ['movement-topdown'],
  'move-free': ['movement-topdown'],
  'move-grid': ['grid-push'],
  'move-vehicle': [],
  flap: [],
  'auto-run': [],
  'wall-jump': [],
  grapple: [],
  stomp: ['combat-stomp'],
  melee: ['melee-attack'],
  'shoot-forward': ['player-shooter'],
  'shoot-aimed': [],
  'bounce-shots': [],
  'auto-attack': ['auto-attack'],
  waves: ['spawner'],
  survive: ['survival', 'objectives'],
  collect: ['pickups'],
  'reach-goal': ['goal', 'objectives'],
  'score-attack': ['objectives'],
  hazards: ['hazards'],
  'rising-hazard': [],
  traffic: [],
  'room-clear': ['room-clear'],
  'push-blocks': ['grid-push'],
  'keys-doors': ['relics'],
  abilities: ['relics'],
  'upgrade-choice': ['boons'],
  boss: ['@fsm'],
  chasers: ['@fsm'],
  telegraphs: ['@fsm'],
  'dodge-bullets': ['@fsm'],
  'splitting-enemies': [],
  'path-enemies': [],
  farming: ['farming'],
  'day-cycle': ['day-clock'],
  sell: ['shipping'],
  'shop-seeds': ['shop'],
  'shop-upgrades': [],
  currency: [],
  trade: [],
  fishing: [],
  gather: [],
  crafting: [],
  dig: [],
  'place-build': [],
  'puzzle-placement': [],
  'physics-sim': [],
  stealth: [],
  'light-cone': [],
  dialogue: [],
  quests: [],
  deduction: [],
  follower: [],
  herd: [],
  'pet-care': [],
  'carry-deliver': [],
  'timed-orders': [],
  rhythm: [],
  cards: [],
  'turn-based': [],
  'grid-tactics': [],
  laps: [],
  rivals: [],
  gates: [],
  'trace-path': [],
  'snake-growth': [],
  'paddle-ball': [],
  'match-board': [],
  'aim-power': [],
  'ball-physics': [],
  'catch-falling': [],
};

export interface Idea {
  id: string;
  prompt: string;
  needs: string[];
}

export interface GapReport {
  ideas: number;
  /** Ideas every mechanic of which the catalog covers. */
  buildable: string[];
  /** Each missing mechanic: how many ideas ask for it, and how many it alone would make whole. */
  missing: Array<{ mechanic: string; askedBy: number; completes: number }>;
  /** The order to build missing mechanics in: each the one that makes the most ideas whole after those before it. */
  plan: Array<{ mechanic: string; completes: number; buildable: number }>;
}

/** The report over a set of ideas; throws on a need the vocabulary has not got or a covering system the catalog lacks. */
export function gapReport(ideas: readonly Idea[], catalog: Readonly<Record<string, unknown>>): GapReport {
  for (const [m, by] of Object.entries(MECHANICS)) for (const s of by) if (!s.startsWith('@') && !catalog[s]) throw new Error(`mechanic '${m}' names system '${s}', which the catalog has not got`);
  for (const i of ideas) for (const n of i.needs) if (!(n in MECHANICS)) throw new Error(`idea ${i.id} needs '${n}', which is not a known mechanic`);
  const covered = (m: string, added: ReadonlySet<string>) => (MECHANICS[m]?.length ?? 0) > 0 || added.has(m);
  const whole = (added: ReadonlySet<string>) => ideas.filter((i) => i.needs.every((n) => covered(n, added)));
  const gaps = Object.keys(MECHANICS).filter((m) => !covered(m, new Set()));
  const base = whole(new Set()).length;
  const missing = gaps
    .map((m) => ({ mechanic: m, askedBy: ideas.filter((i) => i.needs.includes(m)).length, completes: whole(new Set([m])).length - base }))
    .filter((g) => g.askedBy > 0)
    .sort((a, b) => b.completes - a.completes || b.askedBy - a.askedBy || a.mechanic.localeCompare(b.mechanic));
  const plan: GapReport['plan'] = [];
  const added = new Set<string>();
  let now = base;
  while (plan.length < missing.length) {
    let best: { mechanic: string; gain: number; asked: number } | null = null;
    for (const g of missing) {
      if (added.has(g.mechanic)) continue;
      const gain = whole(new Set([...added, g.mechanic])).length - now;
      if (!best || gain > best.gain || (gain === best.gain && g.askedBy > best.asked)) best = { mechanic: g.mechanic, gain, asked: g.askedBy };
    }
    if (!best || best.gain === 0) {
      // No single mechanic makes another idea whole: the next is the one most asked for.
      const next = missing.find((g) => !added.has(g.mechanic))!;
      added.add(next.mechanic);
      now = whole(added).length;
      plan.push({ mechanic: next.mechanic, completes: 0, buildable: now });
      continue;
    }
    added.add(best.mechanic);
    plan.push({ mechanic: best.mechanic, completes: best.gain, buildable: now + best.gain });
    now += best.gain;
  }
  return { ideas: ideas.length, buildable: whole(new Set()).map((i) => i.id), missing, plan };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({ options: { out: { type: 'string', default: 'results/gap-report.json' } } });
  const here = dirname(fileURLToPath(import.meta.url));
  const ideas = (JSON.parse(readFileSync(join(here, '..', 'ideas.json'), 'utf8')) as { ideas: Idea[] }).ideas;
  // Every system a game can be built from: the freeform catalog holds every genre's.
  const r = gapReport(ideas, catalogFor({ genre: 'freeform' }));
  const out = resolve(join(here, '..'), values.out!);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
  console.log(`${r.buildable.length} of ${r.ideas} ideas can be built whole now`);
  console.log(`most asked for: ${[...r.missing].sort((a, b) => b.askedBy - a.askedBy).slice(0, 10).map((g) => `${g.mechanic} ${g.askedBy}`).join(', ')}`);
  console.log('next to build (each makes the most ideas whole after those before it):');
  for (const [i, p] of r.plan.slice(0, 12).entries()) console.log(`  ${String(i + 1).padStart(2)}. ${p.mechanic.padEnd(18)} +${p.completes} -> ${p.buildable} of ${r.ideas}`);
  console.log(`report: ${out}`);
}
