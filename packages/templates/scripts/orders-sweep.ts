/**
 * Timed orders against the courier, on generated levels of a carry-and-deliver game: top-down (a tea room on the
 * survivors' arena, won at `goal` deliveries on one life of three hearts) or side view (a lighthouse keeper's cliff path
 * on the platformer, won by surviving `goal` seconds on three lives). Each level is played by the courier, by the
 * courier at a person's pace (three quarters of its speed, half a second to take in each pick-up and hand-over), by an
 * idle player and by random keys. The defaults in template-core's systems/orders.ts were set with it: the courier wins
 * nine seeds in ten or more with a heart to spare, and idle or random play never wins.
 * Usage: orders-sweep.ts [orders params as JSON] [topdown|side] [goal] [seeds].
 */
import type { FreeformSystemsJson, Objectives } from '@gg/schemas';
import { createSim, emptyInput, Rng, type InputState, type Sim } from '@gg/sdk';
import { courier, runBot, simOptionsFor, type BotPolicy } from '@gg/template-core';
import { freeformManifest } from '@gg/template-freeform/node';

const params = JSON.parse(process.argv[2] ?? '{}') as Record<string, number>;
const side = process.argv[3] === 'side';
const goal = Number(process.argv[4] ?? (side ? 75 : 12));
const seeds = Number(process.argv[5] ?? 20);

const file: FreeformSystemsJson = side
  ? {
      version: 1,
      genre: 'freeform',
      composition: { base: 'platformer' },
      feelPreset: 'celeste-class',
      systems: [
        { id: 'movement-platformer', params: {} },
        { id: 'hazards', params: {} },
        { id: 'combat-stomp', params: {} },
        { id: 'carry', params: { dropoffs: 1 } },
        { id: 'orders', params },
        { id: 'objectives', params: {} },
      ],
    }
  : {
      version: 1,
      genre: 'freeform',
      composition: { base: 'survivors' },
      feelPreset: 'arena-melee',
      systems: [
        { id: 'movement-topdown', params: {} },
        { id: 'carry', params: { dropoffs: 4 } },
        { id: 'orders', params },
        { id: 'objectives', params: {} },
      ],
    };
const objectives: Objectives = side
  ? { version: 1, win: { mode: 'all', clauses: [{ kind: 'survive', seconds: goal }] }, lose: [{ kind: 'lives', count: 3 }] }
  : { version: 1, win: { mode: 'all', clauses: [{ kind: 'hud_at_least', key: 'delivered', value: goal }] }, lose: [{ kind: 'lives', count: 1 }] };

/** A person, roughly: the courier at three quarters of its pace, stopping half a second at each pick-up and hand-over. */
function atAPersonsPace(): BotPolicy {
  let carrying = 0;
  let wait = 0;
  return (sim, tick, mem) => {
    const now = Number(sim.world.hud['_carry'] ?? 0);
    if (now !== carrying) {
      carrying = now;
      wait = 30;
    }
    const input = courier(sim, tick, mem);
    if (wait > 0) {
      wait--;
      return emptyInput();
    }
    return tick % 4 === 0 ? { ...input, left: false, right: false, up: false, down: false } : input;
  };
}

function randomKeys(seed: number): BotPolicy {
  const rng = new Rng(seed);
  const keys = ['left', 'right', 'up', 'down', 'action', 'jump'] as const;
  let held: InputState = emptyInput();
  return (_sim, tick) => {
    if (tick % 12 === 0) held = { ...emptyInput(), [keys[rng.int(keys.length)]!]: true };
    return held;
  };
}

const m = freeformManifest(file);
const limit = 60 * 240;
const tally = { courier: 0, spare: 0, pace: 0, idle: 0, random: 0 };
const seconds: number[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  const difficulty = 0.2 + (seed % 5) * 0.1;
  const level = { ...m.levelGrammar.generate({ seed, difficulty }), id: 'l01', ramp: { segment: 0, difficulty } };
  const content = { ...(m.extraContent?.({ seed, difficulty }) ?? {}), objectives };
  const o = simOptionsFor(m, file, { content, behaviours: m.defaultBehaviours });
  const make = (): Sim => createSim({ ...o, level, seed: 1, player: { ...o.player, hp: 3 } });
  const sim = make();
  const r = runBot(sim, courier, limit);
  const p = sim.world.player;
  // A heart to spare: won without a death and with more than the last heart.
  const spare = r.completed && r.deaths === 0 && p.hp >= 2;
  if (r.completed) {
    tally.courier++;
    seconds.push(r.ticks / 60);
  }
  if (spare) tally.spare++;
  if (runBot(make(), atAPersonsPace(), limit).completed) tally.pace++;
  if (runBot(make(), () => emptyInput(), limit).completed) tally.idle++;
  if (runBot(make(), randomKeys(seed), limit).completed) tally.random++;
  const outcome = r.completed ? `won in ${(r.ticks / 60).toFixed(0)} s, ${p.hp} hp, ${r.deaths} deaths` : `lost (delivered ${String(sim.world.hud['delivered'])}, ${r.deaths} deaths)`;
  console.log(`seed ${seed} d${difficulty.toFixed(1)}: ${outcome}`);
}
const mean = seconds.reduce((a, b) => a + b, 0) / Math.max(1, seconds.length);
console.log(JSON.stringify({ view: side ? 'side' : 'topdown', params, goal, seeds, ...tally, meanSeconds: Math.round(mean) }));
