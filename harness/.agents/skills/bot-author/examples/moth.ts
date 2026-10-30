import { emptyInput } from '@gg/sdk';
import { boxGap, goalSpot, goToward, type BotPolicy } from '@gg/template-core';

/**
 * Example: the bot of a game with an owl (owl.ts). It goes for the lanterns the win still needs, nearest first, then for
 * the goal, running and jumping the way any good player does (goToward). From the moment the owl stirs until it sleeps
 * again it keeps still: on the ground it brakes, and lets the ground stop it once a tick's braking would overshoot; in
 * the air it keeps steering until it lands.
 */
export const moth: BotPolicy = (sim, tick, mem) => {
  const input = emptyInput();
  const p = sim.world.player;
  if (!p.alive) return input;
  if (Number(sim.world.hud['owl'] ?? 0) > 0 && p.grounded) {
    if (Math.abs(p.vx) > sim.options.feel.runAccel / 60) input[p.vx > 0 ? 'left' : 'right'] = true;
    return input;
  }
  // The objectives show the lanterns collected against those the win needs ("1/2").
  const [got = 0, need = 0] = String(sim.world.hud['collected'] ?? '0/0').split('/').map(Number);
  const lanterns = got < need ? sim.world.entities.filter((e) => e.alive && e.type === 'lantern') : [];
  const next = lanterns.reduce<(typeof lanterns)[number] | null>((best, e) => (!best || boxGap(p, e) < boxGap(p, best) ? e : best), null);
  goToward(sim, next ?? goalSpot(sim), input, tick, mem);
  return input;
};
