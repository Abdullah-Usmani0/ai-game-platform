import { createSim } from '@gg/sdk';
import { BOTS } from '@gg/template-survivors/node';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';
const sim = createSim({ ...SIM_OPTIONS, level: LEVELS[0]!, seed: 1 });
const policy = BOTS['kiter']!;
const mem: Record<string, number> = {};
for (let t = 0; t < 61 * 60; t++) {
  sim.step(policy(sim, sim.tick, mem));
  const p = sim.world.player;
  if (t % 180 === 0 || !p.alive || sim.world.flags.won) {
    const alive = sim.world.entities.filter((e) => !e.isPlayer && e.alive && e.contactDamage > 0).length;
    console.log(`t=${(t / 60).toFixed(0)}s hp=${p.hp} alive=${p.alive} pos=${p.x.toFixed(0)},${p.y.toFixed(0)} enemies=${alive} kills=${sim.world.hud['kills'] ?? 0} hits=${sim.events.count('hit')} deaths=${sim.world.deaths} won=${sim.world.flags.won}`);
  }
  if (!p.alive || sim.world.flags.won) break;
}
