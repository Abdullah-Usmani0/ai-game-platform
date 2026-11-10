import { createSim, emptyInput, type Entity, type Sim } from '@gg/sdk';
import { simOptionsFor } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { BROADSIDE } from './examples.js';
import { freeformManifest } from './node.js';

/** Broadside's bay with no raiding fleet: the galleon alone, facing east, and the raiders the test puts where it wants. */
function bay(): Sim {
  const m = freeformManifest(BROADSIDE.systems, BROADSIDE.roster);
  const level = { ...m.levelGrammar.generate({ seed: 1, difficulty: 0.3 }), id: 'arena' };
  const sim = createSim({ ...simOptionsFor(m, BROADSIDE.systems, { content: { objectives: BROADSIDE.objectives, waves: { version: 1, designNotes: 'none', waves: [] } } }), level, seed: 1 });
  sim.world.player.props['heading'] = 0;
  return sim;
}
/** Puts a raider on the water where the test wants it (the sim spawns as a system does). */
const place = (sim: Sim, x: number, y: number): Entity => (sim as Sim & { spawn(type: string, x: number, y: number): Entity }).spawn('raider', x, y);
const shots = (sim: Sim) => sim.world.entities.filter((e) => e.alive && e.type === 'cannonball');

describe('a game at sea', () => {
  it("names the vehicle block's own foe as its raider: drawn as a sloop, sailing by the sloop's behaviour", () => {
    const m = freeformManifest(BROADSIDE.systems, BROADSIDE.roster);
    const raider = m.entityDefs.find((d) => d.type === 'raider')!;
    expect(raider).toMatchObject({ drawAs: 'sloop', fsm: 'sloop', contactDamage: 1, gravity: false });
    expect(m.defaultBehaviours.map((b) => b.id)).toContain('sloop');
  });

  it('fires its guns only at a raider lying abeam, and at that raider', () => {
    const sim = bay();
    const p = sim.world.player;
    // Dead ahead, in range: the guns do not bear, so they hold, however long the key is held.
    const ahead = place(sim, p.x + 60, p.y);
    for (let i = 0; i < 30; i++) sim.step({ ...emptyInput(), action: true });
    expect(shots(sim)).toEqual([]);
    ahead.alive = false;
    // Square off the starboard beam (south, as y runs down): a volley flies at it.
    place(sim, p.x, p.y + 60);
    sim.step({ ...emptyInput(), action: true });
    const fired = shots(sim);
    expect(fired.length).toBeGreaterThan(0);
    for (const s of fired) expect(s.vy).toBeGreaterThan(Math.abs(s.vx));
  });
});
