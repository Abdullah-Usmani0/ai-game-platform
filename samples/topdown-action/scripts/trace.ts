// Traces the clearer bot on a generated floor: hp, kills and position every two seconds, and how the run ends.
import { createSim } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { BOTS, generateRooms, topdownAction, validateRooms } from '@gg/template-topdown-action/node';

const seed = Number(process.argv[2] ?? 31);
const difficulty = Number(process.argv[3] ?? 0.45);
const bot = process.argv[4] ?? 'clearer';
const level = generateRooms({ seed, difficulty });
const v = validateRooms(level);
console.log(`level ${level.id} ${level.width}x${level.height} valid=${v.ok} metrics=${JSON.stringify(v.metrics)} enemies=${level.entities.filter((e) => e.type !== 'gem').map((e) => `${e.type}@${e.x},${e.y}`).join(' ')}`);
const mk = () =>
  createSim({
    level,
    feel: topdownAction.feelPresets[topdownAction.defaultFeel]!,
    seed: 1,
    systems: Object.values(topdownAction.systems).map((m) => m.create()),
    entityDefs: topdownAction.entityDefs,
    player: topdownAction.player,
    behaviours: topdownAction.defaultBehaviours,
    params: {},
    content: {},
    movementMode: 'topdown',
  });
const sim = mk();
const policy = BOTS[bot]!;
const mem: Record<string, number> = {};
let lastHp = sim.world.player.hp;
for (let t = 0; t < 90 * 60; t++) {
  sim.step(policy(sim, sim.tick, mem));
  const p = sim.world.player;
  if (p.hp !== lastHp) {
    const near = sim.world.entities.filter((e) => !e.isPlayer && e.alive && e.contactDamage > 0).map((e) => `${e.type}${e.isProjectile ? '*' : ''}@${Math.round(Math.hypot(e.x - p.x, e.y - p.y))}`).slice(0, 4);
    console.log(`t=${(t / 60).toFixed(1)}s hp ${lastHp}->${p.hp} pos=${p.x.toFixed(0)},${p.y.toFixed(0)} near=${near.join(' ')}`);
    lastHp = p.hp;
  }
  if (t % 120 === 0 || !p.alive || sim.world.flags.won) console.log(`t=${(t / 60).toFixed(0)}s hp=${p.hp} pos=${p.x.toFixed(0)},${p.y.toFixed(0)} enemies=${sim.world.hud['enemies']} exit=${sim.world.hud['exit']} kills=${sim.events.count('death')} swings=${sim.events.count('custom:swing')} won=${sim.world.flags.won}`);
  if (!p.alive || sim.world.flags.won) break;
}
const r = runBot(mk(), policy, 90 * 60);
console.log(`runBot: completed=${r.completed} ticks=${r.ticks} deaths=${r.deaths} hits=${r.events['hit']} deathsEv=${r.events['death']}`);
