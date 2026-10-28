import { createSim, emptyInput, type InputState } from '@gg/sdk';
import { LEVELS, SIM_OPTIONS } from '../src/game.js';
const level = LEVELS[0]!;
const sim = createSim({ ...SIM_OPTIONS, level, seed: 1 });
let jumpHold = 0;
for (let t = 0; t < 1200; t++) {
  const p = sim.world.player;
  const input: InputState = { ...emptyInput(), right: true };
  const aheadX = p.x + p.w + 6;
  const belowKind = sim.map.kindAtPx(aheadX, p.y + p.h + 2);
  const pitAhead = belowKind === 'air' || belowKind === 'hazard';
  if (jumpHold === 0 && p.grounded && (p.hitWall || pitAhead)) jumpHold = 12;
  if (jumpHold > 0) { input.jump = true; jumpHold--; }
  sim.step(input);
  if (t % 30 === 0 || sim.world.flags.won) console.log(t, 'x', p.x.toFixed(1), 'y', p.y.toFixed(1), 'vx', p.vx.toFixed(1), 'vy', p.vy.toFixed(1), 'g', p.grounded, 'wall', p.hitWall, 'alive', p.alive, 'deaths', sim.world.deaths, 'hp', p.hp, 'won', sim.world.flags.won);
  if (sim.world.flags.won) break;
}
