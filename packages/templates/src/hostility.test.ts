/**
 * One rule says what is hostile, whichever genre a system or an entity comes from: anything alive with a behaviour or
 * contact damage that is neither a pickup nor a projectile. A game mixing genres relies on it: a gun from one genre has
 * to be able to defeat the enemies of another (top-down action enemies hurt by what they do, not by touch). Every combat
 * system plays against every hostile of the genres that move the way it does, and must defeat each one.
 */
import type { LevelJson } from '@gg/schemas';
import { centerX, centerY, createSim, emptyInput, isHostile, type Entity, type EntityDef, type InputState, type Sim } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

/** An open walled room, the spawn `above` tiles over the floor in the middle. */
function room(w: number, h: number, above: number): LevelJson {
  const spawn = { x: Math.floor(w / 2), y: h - 2 - above };
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : x === spawn.x && y === spawn.y ? 'S' : '.')).join(''));
  return { version: 1, id: 'room', name: 'Room', tileSize: 8, width: w, height: h, legend: { '.': 'air', '#': 'solid', S: 'spawn' }, rows, entities: [], spawn, goal: spawn };
}

type Drive = (sim: Sim, foe: Entity) => Partial<InputState>;
const toward = (sim: Sim, foe: Entity, near: number): Partial<InputState> => {
  const p = sim.world.player;
  const dx = centerX(foe) - centerX(p);
  const dy = centerY(foe) - centerY(p);
  if (Math.hypot(dx, dy) <= near) return {};
  return { left: dx < -2, right: dx > 2, up: dy < -2, down: dy > 2 };
};
/** Close in and strike, a fresh press every few ticks. */
const strike: Drive = (sim, foe) => ({ ...toward(sim, foe, 10), action: sim.tick % 4 < 2 });
/** Line up under the foe and hold the trigger (shots fly up). */
const fire: Drive = (sim, foe) => {
  const p = sim.world.player;
  const dx = centerX(foe) - centerX(p);
  return { left: dx < -1, right: dx > 1, down: p.y < foe.y + foe.h + 12, action: true };
};
/** Stay in range; the attack is automatic. */
const stay: Drive = (sim, foe) => toward(sim, foe, 24);
/** Fall on it (the spawn is above it): gravity and the bounce do the rest. */
const fall: Drive = () => ({});

/** Each combat system, its home genre (for the movement, feel and player), the types it spawns, and how to fight with it. */
const COMBAT: Array<{ system: string; home: string; uses: string[]; drive: Drive }> = [
  { system: 'melee-attack', home: 'topdown-action', uses: [], drive: strike },
  { system: 'player-shooter', home: 'shmup', uses: ['shot'], drive: fire },
  { system: 'auto-attack', home: 'survivors', uses: ['xp'], drive: stay },
  { system: 'combat-stomp', home: 'platformer', uses: [], drive: fall },
];

describe('one rule for what is hostile', () => {
  for (const c of COMBAT) {
    const home = GENRES[c.home]!;
    const foes = Object.values(GENRES)
      .filter((g) => g.movementMode === home.movementMode)
      .flatMap((g) => g.entityDefs.filter((d) => !d.pickup && !d.projectile && (d.fsm !== undefined || (d.contactDamage ?? 0) > 0)).map((d) => ({ genre: g.id, def: d })));
    it(`${c.system} defeats every ${home.movementMode} genre's hostiles (${foes.length})`, () => {
      const movement = home.requiredSystems.find((id) => home.systems[id]!.meta.provides?.movement)!;
      const platformer = home.movementMode === 'platformer';
      const level = room(24, 14, platformer ? 3 : 0);
      for (const { genre, def } of foes) {
        // The foe stands still (no behaviour is loaded), so only the combat decides: a top-down foe two tiles up, a platformer foe under the spawn.
        const foe: EntityDef = { ...def, type: 'foe' };
        const at = platformer ? { x: level.spawn.x, y: level.height - 2 } : { x: level.spawn.x, y: level.spawn.y - 3 };
        const sim = createSim({
          level: { ...level, entities: [{ type: 'foe', ...at, props: {} }] },
          feel: home.feelPresets[home.defaultFeel]!,
          seed: 1,
          systems: [home.systems[movement]!.create(), home.systems[c.system]!.create()],
          entityDefs: [foe, ...home.entityDefs.filter((d) => c.uses.includes(d.type))],
          player: home.player,
          movementMode: home.movementMode,
        });
        const target = sim.world.entities.find((e) => e.type === 'foe')!;
        expect(isHostile(target), `${genre}:${def.type} is hostile`).toBe(true);
        for (let t = 0; t < 1800 && target.alive && sim.world.player.alive; t++) sim.step({ ...emptyInput(), ...c.drive(sim, target) });
        expect(target.alive, `${c.system} vs ${genre}:${def.type} (hp ${def.hp ?? 1}) after ${sim.tick} ticks`).toBe(false);
      }
    });
  }
});
