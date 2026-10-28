// Traces the dodger: what hits the ship, where, and the state every two seconds.
import { centerX, centerY, createSim } from '@gg/sdk';
import { BOTS, generateSky, generateWaves, shmup } from '@gg/template-shmup/node';
const seed = Number(process.argv[2] ?? 1);
const difficulty = Number(process.argv[3] ?? 0.2);
const bot = process.argv[4] ?? 'dodger';
const level = generateSky({ seed: 1, difficulty });
const waves = generateWaves({ seed: 1, difficulty }, 60);
const sim = createSim({ level, feel: shmup.feelPresets[shmup.defaultFeel]!, seed, systems: Object.values(shmup.systems).map((m) => m.create()), entityDefs: shmup.entityDefs, player: shmup.player, behaviours: shmup.defaultBehaviours, params: {}, content: { waves }, movementMode: 'topdown' });
const policy = BOTS[bot]!;
const mem: Record<string, number> = {};
let seen = 0;
const ring: string[] = [];
for (let t = 0; t < 61 * 60; t++) {
  const input = policy(sim, sim.tick, mem);
  const bullets0 = sim.world.entities.filter((e) => e.isProjectile && e.alive && e.contactDamage > 0).map((e) => `b#${e.id}@${centerX(e).toFixed(0)},${centerY(e).toFixed(0)}v${e.vx.toFixed(0)},${e.vy.toFixed(0)}`);
  ring.push(`t=${t} ship=${centerX(sim.world.player).toFixed(0)},${centerY(sim.world.player).toFixed(0)} keys=${(['left', 'right', 'up', 'down', 'dash'] as const).filter((k) => input[k]).join(',') || '-'} ${bullets0.join(' ')}`);
  if (ring.length > 14) ring.shift();
  sim.step(input);
  const p = sim.world.player;
  const hist = sim.events.history();
  for (const ev of hist.slice(seen)) {
    if (ev.name === 'hit' && ev.payload['target'] === p.id) {
      const src = sim.world.entities.find((e) => e.id === ev.payload['source']);
      console.log(`t=${(t / 60).toFixed(1)}s HIT by ${src ? `${src.type}#${src.id} at ${centerX(src).toFixed(0)},${centerY(src).toFixed(0)} v=${src.vx.toFixed(0)},${src.vy.toFixed(0)}` : `gone#${String(ev.payload['source'])}`} ship=${centerX(p).toFixed(0)},${centerY(p).toFixed(0)} hp=${p.hp}`);
      if (process.argv[5] === 'detail') for (const line of ring) console.log('   ', line);
    }
  }
  seen = hist.length;
  if (t % 120 === 0 || !p.alive || sim.world.flags.won) {
    const hostiles = sim.world.entities.filter((e) => !e.isPlayer && e.alive && e.contactDamage > 0 && !e.isProjectile).length;
    const bullets = sim.world.entities.filter((e) => e.isProjectile && e.alive && e.contactDamage > 0).length;
    console.log(`t=${(t / 60).toFixed(0)}s hp=${p.hp} ship=${centerX(p).toFixed(0)},${centerY(p).toFixed(0)} hostiles=${hostiles} bullets=${bullets} kills=${sim.world.hud['kills']} won=${sim.world.flags.won}`);
  }
  if (!p.alive || sim.world.flags.won) break;
}
